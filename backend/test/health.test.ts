import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { createDb } from "../src/db/client";
import { createTestDb } from "./db";
import { ConfigError, loadConfig } from "../src/config";

describe("каркас сервера", () => {
  it("GET /v1/health — признак сервера, версия API и часы", async () => {
    const app = buildApp({
      config: loadConfig({ LOG_LEVEL: "silent", COMMIT: "abc123" }),
      clock: { now: () => 1_800_000_000_000 },
    });
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      app: "swipeit",
      mode: "remote",
      apiVersion: 1,
      now: 1_800_000_000_000,
      commit: "abc123",
    });
    await app.close();
  });

  it("неверные переменные окружения — понятная ошибка, а не падение потом", () => {
    expect(() => loadConfig({ PORT: "не число" })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: "99999" })).toThrow(/PORT/);
    expect(loadConfig({}).PORT).toBe(4100);
    // База в production — только явно: секрет, а не значение по умолчанию.
    expect(() => loadConfig({ NODE_ENV: "production" })).toThrow(
      /DATABASE_URL/,
    );
    expect(() => loadConfig({ DATABASE_URL: "mysql://x" })).toThrow(
      /DATABASE_URL/,
    );
    // Адрес коротких ссылок в production — тоже только явно (§6.2).
    expect(() =>
      loadConfig({ NODE_ENV: "production", DATABASE_URL: "postgres://db/x" }),
    ).toThrow(/PUBLIC_SHARE_URL/);
    expect(
      loadConfig({ PUBLIC_SHARE_URL: "https://swipeit.example/" })
        .PUBLIC_SHARE_URL,
    ).toBe("https://swipeit.example");
    expect(loadConfig({}).PUBLIC_SHARE_URL).toBe("http://localhost:4100");
  });

  it("неизвестный путь — 404", async () => {
    const app = buildApp({ config: loadConfig({ LOG_LEVEL: "silent" }) });
    const response = await app.inject({ method: "GET", url: "/v1/nope" });
    expect(response.statusCode).toBe(404);
    await app.close();
  });
});

describe("остановка", () => {
  it("app.close() дожидается начатого запроса (SIGTERM без обрыва)", async () => {
    const app = buildApp({ config: loadConfig({ LOG_LEVEL: "silent" }) });
    // Остановку начинаем, когда обработчик уже работает, а не через
    // фиксированные 50 мс: под нагрузкой запрос мог дойти позже close(), и
    // Fastify честно отвечал 503 (return503OnClosing) — тест мигал.
    let started: () => void = () => undefined;
    const handlerStarted = new Promise<void>((resolve) => {
      started = resolve;
    });
    app.get("/v1/slow", async () => {
      started();
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { ok: true };
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const pending = fetch(`http://127.0.0.1:${port}/v1/slow`);
    // Запрос уже в обработчике — начинаем остановку.
    await handlerStarted;
    const closed = app.close();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    await closed;
  });
});

describe("/v1/health и база (B03)", () => {
  it("база отвечает — 200", async () => {
    const db = createTestDb();
    const app = buildApp({ config: loadConfig({ LOG_LEVEL: "silent" }), db });
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.statusCode).toBe(200);
    await app.close();
    await db.close();
  });

  it("база не отвечает — 503 OFFLINE", async () => {
    // Порт, где базы нет: соединение сразу отклоняется.
    const db = createDb("postgres://x:y@127.0.0.1:1/none", 1);
    const app = buildApp({ config: loadConfig({ LOG_LEVEL: "silent" }), db });
    const response = await app.inject({ method: "GET", url: "/v1/health" });
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "OFFLINE" });
    await app.close();
    await db.close();
  });
});
