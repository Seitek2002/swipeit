import { createSeededRandom } from "@swipeit/core/logic/random";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { createEventHub, createRecordingHub } from "../src/realtime/hub";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer } from "./server";

// Находки ревью сервера (docs/progress/auto-review-backend.md): R4, R5.
const database = createTestDb();
afterAll(() => database.close());

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeEach(async () => {
  await resetDb(database);
  server = await createTestServer(database);
});
afterEach(() => server.close());

describe("R4: хаб событий не копит память", () => {
  it("рабочий хаб ничего не хранит; записывающий — для тестов — видит события после commit", async () => {
    expect("delivered" in createEventHub()).toBe(false);
    const hub = createRecordingHub();
    const app = buildApp({
      config: loadConfig({ LOG_LEVEL: "silent" }),
      db: database,
      catalog: await testCatalog(),
      clock: { now: () => NOW },
      random: createSeededRandom("hub"),
      hub,
    });
    await app.inject({ method: "POST", url: "/v1/users" });
    expect(hub.delivered).toEqual([
      expect.objectContaining({ type: "db:changed", scope: ["users"] }),
    ]);
    await app.close();
  });
});

describe("R5: брони не выдают, есть ли такой пользователь", () => {
  it("несуществующий u_… — как чужой без доступа: 403 на бронь, пустой список", async () => {
    const stranger = await server.newUser({ name: "Хитрый" });
    const real = await server.newUser({ name: "Настоящий" });
    await server.request(real, "POST", "/swipes", {
      productId: "p_0001",
      decision: "like",
      context: { kind: "self" },
    });
    const tryReserve = (ownerId: string) =>
      server.request(stranger, "POST", "/reservations", {
        ownerId,
        itemKey: "p_0001",
      });
    const list = async (ownerId: string) =>
      (
        await server.request(
          stranger,
          "GET",
          `/reservations?ownerId=${ownerId}`,
        )
      ).json();
    expect((await tryReserve("u_nobodyhere")).statusCode).toBe(403);
    expect((await tryReserve(real.id)).statusCode).toBe(403);
    expect(await list("u_nobodyhere")).toEqual(await list(real.id));
    // Снимок старой ссылки (ew_…) — по-прежнему можно.
    expect((await tryReserve("ew_snapshot1")).statusCode).toBe(200);
  });
});
