import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { WebSocket } from "ws";

import type { RealtimeEvent } from "@/shared/lib/realtime/types";

import { type LanServer, createLanServer, lanAddresses } from "./server";

const CATALOG_DIR = fileURLToPath(new URL("../catalog-stub", import.meta.url));

let root: string;
let lan: LanServer;
let base: string;

const start = async (options: { reset?: boolean } = {}) => {
  lan = await createLanServer({
    port: 0,
    host: "127.0.0.1",
    bots: false,
    dataDir: path.join(root, "data"),
    outDir: path.join(root, "out"),
    catalogDir: CATALOG_DIR,
    log: () => undefined,
    ...options,
  });
  base = `http://127.0.0.1:${lan.port}`;
};

const api = async (
  method: string,
  apiPath: string,
  { body, userId }: { body?: unknown; userId?: string } = {},
) => {
  const headers: Record<string, string> = {};
  if (userId) headers["x-user-id"] = userId;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await fetch(`${base}/api${apiPath}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, data: (await response.json()) as never };
};

// Сокет, который копит события и умеет дождаться нужного.
const connect = async () => {
  const socket = new WebSocket(`ws://127.0.0.1:${lan.port}/ws`);
  const events: RealtimeEvent[] = [];
  socket.on("message", (data) => events.push(JSON.parse(String(data))));
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return { socket, events };
};

const waitFor = async (check: () => boolean | Promise<boolean>) => {
  for (let i = 0; i < 100; i += 1) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("не дождались");
};

beforeEach(async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "swipeit-lan-"));
  await mkdir(path.join(root, "out", "wishlist"), { recursive: true });
  await writeFile(path.join(root, "out", "index.html"), "<h1>SwipeIt</h1>");
  await writeFile(
    path.join(root, "out", "wishlist", "index.html"),
    "<h1>Вишлист</h1>",
  );
  await writeFile(path.join(root, "out", "404.html"), "<h1>Нет такой</h1>");
  await start();
});

afterEach(async () => {
  await lan.close();
  await rm(root, { recursive: true, force: true });
});

describe("LAN-сервер", () => {
  it("GET /api/health — признак режима lan и часы сервера", async () => {
    const { status, data } = await api("GET", "/health");
    expect(status).toBe(200);
    const health = data as {
      app: string;
      mode: string;
      now: number;
      serverId: string;
    };
    expect(health).toMatchObject({ app: "swipeit", mode: "lan" });
    expect(health.serverId).toBe(lan.serverId);
    expect(Math.abs(health.now - Date.now())).toBeLessThan(5000);
  });

  it("демо-вход, потом свой вишлист по x-user-id", async () => {
    const login = await api("POST", "/auth/demo");
    expect(login.status).toBe(200);
    const userId = (login.data as { id: string }).id;
    expect(userId).toBeTruthy();
    const wishlist = await api("GET", "/wishlist", { userId });
    expect(wishlist.status).toBe(200);
    expect(
      (wishlist.data as { items: unknown[] }).items.length,
    ).toBeGreaterThan(0);
  });

  it("ошибки — HTTP-статус и { code, message }", async () => {
    const unknown = await api("GET", "/nope");
    expect(unknown.status).toBe(404);
    expect(unknown.data).toMatchObject({ code: "NOT_FOUND" });

    const noUser = await api("GET", "/me");
    expect(noUser.status).toBe(403);
    expect(noUser.data).toMatchObject({
      code: "FORBIDDEN",
      message: "Сначала представься",
    });

    const invalid = await api("POST", "/users", { body: { name: "" } });
    expect(invalid.status).toBe(400);
    expect(invalid.data).toMatchObject({ code: "VALIDATION" });

    const response = await fetch(`${base}/api/users`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{ не json",
    });
    expect(response.status).toBe(400);
  });

  it("POST /api/plans/expire — проход по дедлайнам без профиля", async () => {
    const { status, data } = await api("POST", "/plans/expire");
    expect(status).toBe(200);
    expect(data).toEqual({ expired: [] });
  });

  it("гостевые маршруты работают без профиля", async () => {
    const { status } = await fetch(
      `${base}/api/reservations?ownerId=u_azamat`,
    ).then(async (response) => ({ status: response.status }));
    expect(status).toBe(200);
  });

  it("CORS: preflight 204 и Allow-Origin в ответе", async () => {
    const preflight = await fetch(`${base}/api/me`, {
      method: "OPTIONS",
      headers: {
        origin: "http://localhost:3000",
        "access-control-request-method": "PATCH",
        "access-control-request-headers": "x-user-id",
      },
    });
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
    expect(preflight.headers.get("access-control-allow-headers")).toContain(
      "x-user-id",
    );
    const health = await fetch(`${base}/api/health`, {
      headers: { origin: "http://localhost:3000" },
    });
    expect(health.headers.get("access-control-allow-origin")).toBe(
      "http://localhost:3000",
    );
  });

  it("онлайн по hello из WebSocket и событие users при смене", async () => {
    const watcher = await connect();
    const phone = await connect();
    phone.socket.send(JSON.stringify({ type: "hello", userId: "u_phone" }));
    await waitFor(async () => {
      const { data } = await api("GET", "/presence");
      return (data as { online: string[] }).online.includes("u_phone");
    });
    expect(watcher.events).toContainEqual({
      type: "db:changed",
      scope: ["users"],
      by: "system",
    });

    phone.socket.close();
    await waitFor(async () => {
      const { data } = await api("GET", "/presence");
      return (data as { online: string[] }).online.length === 0;
    });
    watcher.socket.close();
  });

  it("события обработчиков приходят всем по /ws", async () => {
    const phone = await connect();
    await api("POST", "/auth/demo");
    await waitFor(() => phone.events.length > 0);
    phone.socket.close();
  });

  it("фото: загрузить и отдать с верным типом", async () => {
    const jpeg = Buffer.concat([
      Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
      Buffer.alloc(64, 1),
    ]);
    const upload = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { "content-type": "image/jpeg" },
      body: jpeg,
    });
    expect(upload.status).toBe(200);
    const { key, url } = (await upload.json()) as { key: string; url: string };
    expect(key).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(url).toBe(`/api/uploads/${key}`);

    const photo = await fetch(`${base}${url}`);
    expect(photo.status).toBe(200);
    expect(photo.headers.get("content-type")).toBe("image/jpeg");
    expect(Buffer.from(await photo.arrayBuffer()).equals(jpeg)).toBe(true);

    const notImage = await fetch(`${base}/api/uploads`, {
      method: "POST",
      headers: { "content-type": "image/png" },
      body: "точно не картинка",
    });
    expect(notImage.status).toBe(400);
    expect((await fetch(`${base}/api/uploads/..%2Fdb`)).status).toBe(404);
  });

  it("статика из out/ и 404.html для неизвестных путей", async () => {
    const home = await fetch(`${base}/`);
    expect(home.status).toBe(200);
    expect(await home.text()).toContain("SwipeIt");
    const wishlist = await fetch(`${base}/wishlist/`);
    expect(await wishlist.text()).toContain("Вишлист");
    const missing = await fetch(`${base}/no-such-page/`);
    expect(missing.status).toBe(404);
    expect(await missing.text()).toContain("Нет такой");
  });

  it("перезапуск сохраняет данные и serverId, --reset — нет", async () => {
    const created = await api("POST", "/auth/demo");
    const userId = (created.data as { id: string }).id;
    await api("PATCH", "/me", { userId, body: { name: "Айгерим Тест" } });
    const { serverId } = lan;
    await lan.close();

    await start();
    expect(lan.dbOrigin).toBe("loaded");
    expect(lan.serverId).toBe(serverId);
    const me = await api("GET", "/me", { userId });
    expect((me.data as { name: string }).name).toBe("Айгерим Тест");
    await lan.close();

    await start({ reset: true });
    expect(lan.dbOrigin).toBe("created");
    expect(lan.serverId).not.toBe(serverId);
    const fresh = JSON.parse(
      await readFile(path.join(root, "data", "db.json"), "utf8"),
    ) as { users: Record<string, { name: string }> };
    expect(fresh.users[userId]?.name).not.toBe("Айгерим Тест");
  });

  it("второй сервер на занятом порту — понятная ошибка", async () => {
    await expect(
      createLanServer({
        port: lan.port,
        host: "127.0.0.1",
        bots: false,
        dataDir: path.join(root, "data2"),
        outDir: path.join(root, "out"),
        catalogDir: CATALOG_DIR,
        log: () => undefined,
      }),
    ).rejects.toThrow("занят");
  });
});

describe("lanAddresses", () => {
  it("только внешние IPv4, Wi-Fi первым, виртуальные в конце", () => {
    const entry = (address: string, internal = false) => ({
      address,
      family: "IPv4" as const,
      internal,
      netmask: "255.255.255.0",
      mac: "00:00:00:00:00:00",
      cidr: null,
    });
    expect(
      lanAddresses({
        "vEthernet (WSL)": [entry("172.20.0.1")],
        Ethernet: [entry("10.0.0.5")],
        "Wi-Fi": [entry("192.168.1.34")],
        Loopback: [entry("127.0.0.1", true)],
        APIPA: [entry("169.254.1.1")],
      }),
    ).toEqual(["192.168.1.34", "10.0.0.5", "172.20.0.1"]);
  });
});
