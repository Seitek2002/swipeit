import { describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { ConfigError, loadConfig } from "../src/config.js";

describe("каркас сервера", () => {
  it("GET /v1/health — признак сервера, версия API и часы", async () => {
    const app = buildApp({
      config: loadConfig({ LOG_LEVEL: "silent", COMMIT: "abc123" }),
      now: () => 1_800_000_000_000,
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
    app.get("/v1/slow", async () => {
      await new Promise((resolve) => setTimeout(resolve, 200));
      return { ok: true };
    });
    await app.listen({ host: "127.0.0.1", port: 0 });
    const address = app.server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const pending = fetch(`http://127.0.0.1:${port}/v1/slow`);
    // Запрос уже ушёл — начинаем остановку.
    await new Promise((resolve) => setTimeout(resolve, 50));
    const closed = app.close();
    const response = await pending;
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
    await closed;
  });
});
