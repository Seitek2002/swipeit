import { createSeededRandom } from "@swipeit/core/logic/random";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { errorsDaily, funnelDaily, users } from "../src/db/schema";
import { readLive } from "../src/domains/funnel/live";
import { runRehearsal } from "../src/rehearsal/run";
import { testConfig } from "./config";
import { testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";

// Репетиция против живого сервера с OPS_TOKEN (auto-tasks-metrics-1 M01):
// счётчики воронки до и после совпадают, игра репетиции не видна в
// «Сейчас», а её CONFLICT — в «из них свои/репетиция». Настоящие часы и
// порт: репетиция ходит по HTTP и WebSocket, как на staging.
const database = createTestDb();
afterAll(() => database.close());

const TOKEN = "ops-token-for-tests-0123456789";
let app: ReturnType<typeof buildApp>;
let base = "";
beforeEach(async () => {
  await resetDb(database);
  app = buildApp({
    config: testConfig({ OPS_TOKEN: TOKEN }),
    db: database,
    catalog: await testCatalog(),
    random: createSeededRandom("rehearsal"),
  });
  await app.listen({ host: "127.0.0.1", port: 0 });
  const address = app.server.address();
  const port = typeof address === "object" && address ? address.port : 0;
  base = `http://127.0.0.1:${port}`;
});
afterEach(() => app.close());

const funnelRows = () =>
  database.db
    .select()
    .from(funnelDaily)
    .orderBy(funnelDaily.day, funnelDaily.step);

describe("репетиция с --ops-token (M01)", () => {
  it("воронка до и после совпадает, игра скрыта, CONFLICT — свои", async () => {
    const before = await funnelRows();
    const lines: string[] = [];
    const result = await runRehearsal({
      base,
      people: 5,
      usersPerMinute: 600,
      opsToken: TOKEN,
      keep: true,
      injectLeak: false,
      log: (line) => lines.push(line),
    });
    expect(result.ok, `${lines.join("\n")}\n${result.summary}`).toBe(true);
    expect(result.summary).not.toContain("--since");

    // Счётчики воронки не изменились — ни одной строки.
    expect(await funnelRows()).toEqual(before);
    // Все профили репетиции — свои (--keep: остались).
    const profiles = await database.db
      .select({ internal: users.funnelInternal })
      .from(users);
    expect(profiles.length).toBe(5);
    expect(profiles.every((row) => row.internal)).toBe(true);

    // «Сейчас»: игра репетиции скрыта, с includeInternal — видна.
    const catalog = await testCatalog();
    const live = await readLive(database.db, catalog, Date.now());
    expect(live.hidden.santa).toBe(1);
    expect(live.santaDrawn).toEqual([]);
    const all = await readLive(database.db, catalog, Date.now(), {
      includeInternal: true,
    });
    expect(all.santaDrawn).toHaveLength(1);

    // Ожидаемые CONFLICT репетиции — все в «из них свои».
    const conflicts = (await database.db.select().from(errorsDaily)).filter(
      (row) => row.code === "CONFLICT",
    );
    expect(conflicts.length).toBeGreaterThan(0);
    for (const row of conflicts) expect(row.internal).toBe(row.count);
  }, 120_000);

  it("без токена — предупреждение первой строкой", async () => {
    const lines: string[] = [];
    // Сервер недоступен — сценарий падает на шаге 0, предупреждение уже
    // напечатано.
    const result = await runRehearsal({
      base: "http://127.0.0.1:9",
      people: 5,
      usersPerMinute: 600,
      keep: true,
      injectLeak: false,
      log: (line) => lines.push(line),
    });
    expect(lines[0]).toContain(
      "счётчики воронки изменятся — запусти с --ops-token",
    );
    expect(result.warnings.join("\n")).toContain("--ops-token");
  }, 30_000);
});
