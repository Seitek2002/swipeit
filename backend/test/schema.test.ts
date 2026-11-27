import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { runMigrations } from "../src/db/migrate";
import * as schema from "../src/db/schema";
import { createTestDb, resetDb } from "./db";

const database = createTestDb();
const { db } = database;

afterAll(() => database.close());
beforeEach(() => resetDb(database));

const NOW = new Date("2026-11-28T12:00:00.000Z");

const user = (id: string) =>
  db.insert(schema.users).values({ id, avatarColor: "mint", name: id });

// Нарушение ограничения базы: код ошибки PostgreSQL у причины (drizzle
// оборачивает ошибку драйвера).
const pgCode = async (promise: Promise<unknown>) => {
  try {
    await promise;
    return null;
  } catch (error) {
    const cause = (error as { cause?: { code?: string } }).cause;
    return cause?.code ?? (error as { code?: string }).code ?? "unknown";
  }
};
const UNIQUE = "23505";
const CHECK = "23514";

describe("миграции", () => {
  it("повторный запуск ничего не меняет", async () => {
    const tables = () =>
      database.pool.query(
        "select count(*)::int as n from pg_tables where schemaname = 'public'",
      );
    const before = (await tables()).rows[0];
    await runMigrations(db);
    expect((await tables()).rows[0]).toEqual(before);
    // 21 таблица §4.2 (служебная таблица drizzle — в своей схеме).
    expect(before.n).toBe(21);
  });
});

describe("ограничения схемы (BACKEND.md §4.2)", () => {
  it("вторая открытая бронь того же желания падает, закрытая — не мешает", async () => {
    await user("u_owner");
    await user("u_a");
    await user("u_b");
    const reservation = (id: string, reserverId: string) =>
      db.insert(schema.reservations).values({
        id,
        ownerRef: "u_owner",
        itemKey: "p_0001",
        reserverId,
        reserverName: reserverId,
        at: NOW,
      });
    await reservation("rs_1", "u_a");
    expect(await pgCode(reservation("rs_2", "u_b"))).toBe(UNIQUE);
    await db
      .update(schema.reservations)
      .set({ closedAt: NOW })
      .where(eq(schema.reservations.id, "rs_1"));
    expect(await pgCode(reservation("rs_3", "u_b"))).toBeNull();
  });

  it("второй свайп той же карточки в том же контексте — нельзя; запись идёт через upsert", async () => {
    await user("u_1");
    const swipe = (id: string, decision: "like" | "pass") =>
      db.insert(schema.productSwipes).values({
        id,
        userId: "u_1",
        productId: "p_0001",
        decision,
        contextKey: "self",
        at: NOW,
      });
    await swipe("sw_1", "like");
    expect(await pgCode(swipe("sw_2", "pass"))).toBe(UNIQUE);
    // Upsert: повторный свайп заменяет прежний.
    await swipe("sw_2", "pass").onConflictDoUpdate({
      target: [
        schema.productSwipes.userId,
        schema.productSwipes.contextKey,
        schema.productSwipes.productId,
      ],
      set: { decision: "pass", at: NOW },
    });
    const rows = await db.select().from(schema.productSwipes);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.decision).toBe("pass");
    // В другом контексте — отдельный свайп.
    await db.insert(schema.productSwipes).values({
      id: "sw_3",
      userId: "u_1",
      productId: "p_0001",
      decision: "like",
      contextKey: "pick:pk_1",
      at: NOW,
    });
  });

  it("у одного подопечного не бывает двух Сант", async () => {
    for (const id of ["u_owner", "u_a", "u_b", "u_c"]) await user(id);
    await db.insert(schema.santaGames).values({
      id: "sg_1",
      title: "Офис",
      ownerId: "u_owner",
      budget: 2000,
      exchangeDate: "2026-12-27",
    });
    await db.insert(schema.santaAssignments).values({
      gameId: "sg_1",
      santaId: "u_a",
      wardId: "u_c",
    });
    expect(
      await pgCode(
        db.insert(schema.santaAssignments).values({
          gameId: "sg_1",
          santaId: "u_b",
          wardId: "u_c",
        }),
      ),
    ).toBe(UNIQUE);
    expect(
      await pgCode(
        db.insert(schema.santaAssignments).values({
          gameId: "sg_1",
          santaId: "u_b",
          wardId: "u_b",
        }),
      ),
    ).toBe(CHECK);
  });

  it("«ММ-ДД» и статусы проверяет база", async () => {
    expect(
      await pgCode(
        db
          .insert(schema.users)
          .values({ id: "u_x", avatarColor: "mint", birthday: "14-03" }),
      ),
    ).toBe(CHECK);
    await user("u_1");
    expect(
      await pgCode(
        db.insert(schema.plans).values({
          id: "pl_1",
          title: "План",
          ownerId: "u_1",
          mode: "deadline",
          status: "swiping",
          filters: {},
          deck: [],
        }),
      ),
    ).toBe(CHECK);
    expect(
      await pgCode(
        db.execute(
          sql`insert into plans (id, title, owner_id, mode, status, filters, deck) values ('pl_2', 'План', 'u_1', 'live', 'done', '{}', '{}')`,
        ),
      ),
    ).toBe(CHECK);
  });

  it("одно живое желание на товар; удалённое не мешает добавить снова", async () => {
    await user("u_1");
    const item = (id: string) =>
      db.insert(schema.wishlistItems).values({
        id,
        ownerId: "u_1",
        sourceKind: "product",
        productId: "p_0001",
        sortOrder: 0,
        addedAt: NOW,
      });
    await item("wi_1");
    expect(await pgCode(item("wi_2"))).toBe(UNIQUE);
    await db
      .update(schema.wishlistItems)
      .set({ deletedAt: NOW })
      .where(eq(schema.wishlistItems.id, "wi_1"));
    expect(await pgCode(item("wi_3"))).toBeNull();
  });
});
