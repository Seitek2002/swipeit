import { createSeededRandom } from "@swipeit/core/logic/random";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { funnelDaily, santaAssignments } from "../src/db/schema";
import { makeFriends } from "../src/domains/friends/handlers";
import { createRecordingHub } from "../src/realtime/hub";
import { runSchedulerOnce } from "../src/scheduler";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer, makeClock, type TestUser } from "./server";

// Планировщик (BACKEND.md B13) и неудачная жеребьёвка по дате (R08).
const database = createTestDb();
afterAll(() => database.close());

let clock: ReturnType<typeof makeClock>;
let server: Awaited<ReturnType<typeof createTestServer>>;
let hub: ReturnType<typeof createRecordingHub>;
beforeEach(async () => {
  await resetDb(database);
  clock = makeClock();
  server = await createTestServer(database, clock);
  hub = createRecordingHub();
});
afterEach(() => server.close());

const tick = async () =>
  runSchedulerOnce({
    db: database,
    catalog: await testCatalog(),
    clock,
    random: createSeededRandom("scheduler"),
    hub,
    log: server.app.log,
  });

const HOUR = 3600_000;

const friends = async (owner: TestUser, names: string[]) => {
  const result: TestUser[] = [];
  for (const name of names) {
    const friend = await server.newUser({ name });
    await database.db.transaction((tx) =>
      makeFriends(tx, owner.id, friend.id, "plan", { now: () => NOW }),
    );
    result.push(friend);
  }
  return result;
};

describe("планировщик (B13)", () => {
  it("дедлайн «До даты» прошёл — план в итогах, участникам событие", async () => {
    const owner = await server.newUser({ name: "Айгерим" });
    const [friend] = await friends(owner, ["Азамат"]);
    const created = (
      await server.request(owner, "POST", "/plans", {
        title: "Выходные",
        mode: "deadline",
        deadline: new Date(NOW + HOUR).toISOString(),
        participantIds: [friend?.id],
        filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
      })
    ).json() as { plan: { id: string } };
    const id = created.plan.id;
    expect((await tick()).expired).toEqual([]);
    clock.advance(2 * HOUR);
    expect((await tick()).expired).toEqual([id]);
    const view = (
      await server.request(owner, "GET", `/plans/${id}`)
    ).json() as {
      plan: { status: string };
    };
    expect(view.plan.status).toBe("results");
    const sent = hub.addressed.find(
      (entry) => entry.event.type === "db:changed" && entry.event.id === id,
    );
    expect([...(sent?.to ?? [])].sort()).toEqual([owner.id, friend?.id].sort());
  });

  it("drawAt прошёл — пары есть", async () => {
    const owner = await server.newUser({ name: "Айгерим" });
    const others = await friends(owner, ["Азамат", "Нурай"]);
    const created = (
      await server.request(owner, "POST", "/santa", {
        title: "Офис",
        budget: 2000,
        exchangeDate: "2026-12-25",
        drawMode: "date",
        drawAt: new Date(NOW + HOUR).toISOString(),
        participantIds: others.map((o) => o.id),
      })
    ).json() as { game: { id: string } };
    const id = created.game.id;
    for (const other of others) {
      await server.request(other, "POST", `/santa/${id}/join`);
    }
    clock.advance(2 * HOUR);
    expect((await tick()).drawn).toEqual([id]);
    const pairs = await database.db
      .select()
      .from(santaAssignments)
      .where(eq(santaAssignments.gameId, id));
    expect(pairs).toHaveLength(3);
  });

  it("R08: игра на двоих — 10 проходов дают одну отметку и один тост; вступил третий — жеребьёвка прошла", async () => {
    const owner = await server.newUser({ name: "Айгерим" });
    const [azamat, nurai] = await friends(owner, ["Азамат", "Нурай"]);
    const created = (
      await server.request(owner, "POST", "/santa", {
        title: "Офис",
        budget: 2000,
        exchangeDate: "2026-12-25",
        drawMode: "date",
        drawAt: new Date(NOW + HOUR).toISOString(),
        participantIds: [azamat?.id, nurai?.id],
      })
    ).json() as { game: { id: string } };
    const id = created.game.id;
    await server.request(azamat as TestUser, "POST", `/santa/${id}/join`);
    clock.advance(2 * HOUR);
    for (let index = 0; index < 10; index += 1) await tick();
    const toasts = hub.addressed.filter(
      (entry) => entry.event.type === "toast",
    );
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.to).toEqual([owner.id]);
    const [failedRow] = await database.db
      .select()
      .from(funnelDaily)
      .where(eq(funnelDaily.step, "santa_draw_failed"));
    expect(failedRow?.count).toBe(1);
    const view = (
      await server.request(azamat as TestUser, "GET", `/santa/${id}`)
    ).json() as {
      drawFailed: null | { reason: string };
      game: { status: string };
    };
    expect(view.drawFailed?.reason).toBeTruthy();
    expect(JSON.stringify(view)).not.toMatch(/assignments|wardId/);

    // Вступил третий — отметка снята, следующий проход провёл жеребьёвку.
    await server.request(nurai as TestUser, "POST", `/santa/${id}/join`);
    expect((await tick()).drawn).toEqual([id]);
  });
});
