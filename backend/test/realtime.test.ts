import type { AddressInfo } from "node:net";

import type { RealtimeEvent } from "@swipeit/core/realtime/types";
import { createSeededRandom } from "@swipeit/core/logic/random";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";
import WebSocket from "ws";

import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { makeFriends } from "../src/domains/friends/handlers";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";

// WebSocket /v1/ws (BACKEND.md B12): события только адресатам, без by,
// вход — hello { token }, иначе 4401.
const database = createTestDb();
afterAll(() => database.close());

let app: ReturnType<typeof buildApp>;
let base = "";
beforeEach(async () => {
  await resetDb(database);
  app = buildApp({
    config: loadConfig({ LOG_LEVEL: "silent" }),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => NOW },
    random: createSeededRandom("realtime"),
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const { port } = app.server.address() as AddressInfo;
  base = `127.0.0.1:${port}`;
});
afterEach(() => app.close());

type Person = { id: string; token: string };

const api = async <T>(
  person: null | Person,
  method: "GET" | "PATCH" | "POST",
  url: string,
  body?: object,
): Promise<T> => {
  const response = await fetch(`http://${base}/v1${url}`, {
    method,
    headers: {
      ...(body ? { "content-type": "application/json" } : {}),
      ...(person ? { authorization: `Bearer ${person.token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(
      `${method} ${url}: ${response.status} ${await response.text()}`,
    );
  }
  return (await response.json()) as T;
};

const person = async (name: string): Promise<Person> => {
  const { me, token } = await api<{ me: { id: string }; token: string }>(
    null,
    "POST",
    "/users",
    {},
  );
  const created = { id: me.id, token };
  await api(created, "PATCH", "/me", { name });
  return created;
};

type Client = {
  close: () => void;
  // Всё, что пришло после ready.
  events: RealtimeEvent[];
  raw: string[];
};

// Подключиться и дождаться ready.
const connect = (token: string) =>
  new Promise<Client>((resolve, reject) => {
    const socket = new WebSocket(`ws://${base}/v1/ws`);
    const client: Client = {
      events: [],
      raw: [],
      close: () => socket.close(),
    };
    socket.on("open", () =>
      socket.send(JSON.stringify({ type: "hello", token })),
    );
    socket.on("message", (data) => {
      const text = String(data);
      const message = JSON.parse(text) as { type: string };
      if (message.type === "ready") {
        resolve(client);
        return;
      }
      client.raw.push(text);
      client.events.push(message as RealtimeEvent);
    });
    socket.on("close", (code) => reject(new Error(`closed ${code}`)));
    socket.on("error", reject);
  });

const closeCode = (send?: object) =>
  new Promise<number>((resolve) => {
    const socket = new WebSocket(`ws://${base}/v1/ws`);
    socket.on("open", () => {
      if (send) socket.send(JSON.stringify(send));
    });
    socket.on("close", (code) => resolve(code));
  });

// События доставляются после ответа — даём им дойти.
const settle = () => new Promise((done) => setTimeout(done, 150));

describe("WebSocket /v1/ws (B12)", () => {
  it("бронь гостя — событие владельцу и гостю, третьему — ничего; без by", async () => {
    const { products } = await testCatalog();
    const owner = await person("Айгерим");
    for (const product of products.slice(0, 5)) {
      await api(owner, "POST", "/swipes", {
        productId: product.id,
        decision: "like",
        context: { kind: "self" },
      });
    }
    const { code } = await api<{ code: string }>(
      owner,
      "POST",
      "/wishlist/share",
    );
    const guest = await person("Бакыт");
    const stranger = await person("Чужой");
    const [ownerWs, guestWs, strangerWs] = await Promise.all(
      [owner, guest, stranger].map((p) => connect(p.token)),
    );
    await api(guest, "GET", `/share/${code}`);
    await settle();
    for (const client of [ownerWs, guestWs, strangerWs])
      client?.events.splice(0);
    await api(guest, "POST", "/reservations", {
      ownerId: owner.id,
      itemKey: products[0]?.id ?? "",
      share: code,
    });
    await settle();
    const scopes = (client?: Client) =>
      client?.events.filter((event) => event.type === "db:changed") ?? [];
    expect(scopes(ownerWs).length).toBeGreaterThan(0);
    expect(scopes(guestWs).length).toBeGreaterThan(0);
    expect(strangerWs?.events).toEqual([]);
    for (const client of [ownerWs, guestWs]) {
      for (const text of client?.raw ?? []) {
        expect(text).not.toContain('"by"');
        expect(text).not.toContain("Бакыт");
      }
    }
    for (const client of [ownerWs, guestWs, strangerWs]) client?.close();
  });

  it("свайп в плане — участникам; «Организатор отменил решение» — всем, кроме организатора", async () => {
    const owner = await person("Айгерим");
    const friend = await person("Азамат");
    const outsider = await person("Чужой");
    await database.db.transaction((tx) =>
      makeFriends(tx, owner.id, friend.id, "plan", { now: () => NOW }),
    );
    const created = await api<{ plan: { id: string } }>(
      owner,
      "POST",
      "/plans",
      {
        title: "Пятница",
        mode: "live",
        participantIds: [friend.id],
        filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
      },
    );
    const id = created.plan.id;
    await api(friend, "POST", `/plans/${id}/ready`, { ready: true });
    const started = await api<{ plan: { deck: string[] } }>(
      owner,
      "POST",
      `/plans/${id}/start`,
    );
    const [ownerWs, friendWs, outsiderWs] = await Promise.all(
      [owner, friend, outsider].map((p) => connect(p.token)),
    );
    await api(friend, "POST", `/plans/${id}/swipes`, {
      activityId: started.plan.deck[0],
      decision: "like",
    });
    await settle();
    const progress = (client?: Client) =>
      client?.events.filter((event) => event.type === "plan:progress") ?? [];
    expect(progress(ownerWs)).toHaveLength(1);
    expect(progress(friendWs)).toHaveLength(1);
    expect(outsiderWs?.events).toEqual([]);

    for (const member of [owner, friend]) {
      await api(member, "POST", `/plans/${id}/finish`);
    }
    await api(owner, "POST", `/plans/${id}/decide`, {
      method: "owner",
      activityId: started.plan.deck[0],
    });
    await settle();
    for (const client of [ownerWs, friendWs]) client?.events.splice(0);
    await api(owner, "POST", `/plans/${id}/decide/cancel`);
    await settle();
    const toasts = (client?: Client) =>
      client?.events.filter((event) => event.type === "toast") ?? [];
    expect(toasts(friendWs)).toHaveLength(1);
    expect(toasts(ownerWs)).toHaveLength(0);
    expect(outsiderWs?.events).toEqual([]);
    for (const client of [ownerWs, friendWs, outsiderWs]) client?.close();
  });

  it("Санта: участникам — «перечитай» без имён, пар и by", async () => {
    const owner = await person("Айгерим");
    const created = await api<{ game: { id: string } }>(
      owner,
      "POST",
      "/santa",
      {
        title: "Офис",
        budget: 2000,
        exchangeDate: "2026-12-25",
        participantIds: [],
      },
    );
    const id = created.game.id;
    const others = [await person("Азамат"), await person("Нурай")];
    for (const other of others) await api(other, "POST", `/santa/${id}/join`);
    const clients = await Promise.all(
      [owner, ...others].map((p) => connect(p.token)),
    );
    await api(owner, "POST", `/santa/${id}/draw`);
    for (const member of [owner, ...others]) {
      await api(member, "POST", `/santa/${id}/open`);
      await api(member, "POST", `/santa/${id}/bought`, { bought: true });
    }
    await settle();
    for (const client of clients) {
      expect(client.events.length).toBeGreaterThan(0);
      for (const text of client.raw) {
        expect(text).not.toContain('"by"');
        expect(text).not.toMatch(/ward|santaId|assignments/);
        for (const name of ["Айгерим", "Азамат", "Нурай"]) {
          expect(text).not.toContain(name);
        }
      }
      client.close();
    }
  });

  it("неверный токен — 4401; без hello — 4401 через 5 секунд", async () => {
    expect(await closeCode({ type: "hello", token: "nope" })).toBe(4401);
    expect(await closeCode({ type: "ping" })).toBe(4401);
    const started = Date.now();
    expect(await closeCode()).toBe(4401);
    expect(Date.now() - started).toBeGreaterThanOrEqual(4_900);
  }, 15_000);
});
