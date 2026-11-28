import { Writable } from "node:stream";

import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { testConfig } from "./config";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";

// Журнал сервера (auto-tasks-metrics-1 M12): его читает администратор —
// коллега из того же офиса. Кодов коротких ссылок, приглашений и токенов в
// нём быть не должно: по коду открывается чужой вишлист.
const database = createTestDb();
afterAll(() => database.close());
beforeEach(() => resetDb(database));

const OPS_TOKEN = "ops-token-for-tests-0123456789";
const CODE = "ABC123SecretCode";

describe("журнал без кодов ссылок и токенов (M12)", () => {
  it("GET /v1/share/<код> → в журнале шаблон /v1/share/:code, без кода и Bearer", async () => {
    let logs = "";
    const sink = new Writable({
      write(chunk, _encoding, done) {
        logs += String(chunk);
        done();
      },
    });
    const app = buildApp({
      config: testConfig({ LOG_LEVEL: "info", OPS_TOKEN }),
      db: database,
      catalog: await testCatalog(),
      clock: { now: () => NOW },
      logStream: sink,
    });
    const created = await app.inject({ method: "POST", url: "/v1/users" });
    const { token } = created.json() as { token: string };
    await app.inject({
      method: "GET",
      url: `/v1/share/${CODE}`,
      headers: { authorization: `Bearer ${token}` },
    });
    // Превью короткой ссылки и неизвестный адрес с кодом в пути.
    await app.inject({ method: "GET", url: `/s/${CODE}` });
    await app.inject({ method: "GET", url: `/v1/nope/${CODE}?code=${CODE}` });
    // Заголовок репетиции — тоже токен.
    await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: { "x-swipeit-rehearsal": OPS_TOKEN },
    });
    await app.close();

    expect(logs).toContain("/v1/share/:code");
    expect(logs).toContain("/s/:code");
    expect(logs).toContain("(маршрут не найден)");
    expect(logs).toContain("requestId");
    expect(logs).not.toContain(CODE);
    expect(logs).not.toContain(token);
    expect(logs).not.toContain(OPS_TOKEN);
    expect(logs).not.toContain("Bearer");
  });
});
