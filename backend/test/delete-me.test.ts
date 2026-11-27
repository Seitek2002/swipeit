import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import * as schema from "../src/db/schema";
import { makeFriends } from "../src/domains/friends/handlers";
import { NOW } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer, type TestUser } from "./server";

// DELETE /me (BACKEND.md §3.4, B05): после удаления в базе нет строк
// человека, кроме обезличенных строк в чужих планах и играх.
const database = createTestDb();
afterAll(() => database.close());

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeEach(async () => {
  await resetDb(database);
  server = await createTestServer(database);
});
afterEach(() => server.close());

const { db } = database;
const at = new Date(NOW);

// Таблицы и строки, где встречается id человека (любое поле, в том числе
// jsonb и массивы).
const rowsMentioning = async (id: string) => {
  const { rows: tables } = await database.pool.query<{ tablename: string }>(
    `select tablename from pg_tables where schemaname = 'public'
     and tablename not like '__drizzle%'`,
  );
  const found: Record<string, number> = {};
  for (const { tablename } of tables) {
    const { rows } = await database.pool.query<{ count: string }>(
      `select count(*) from "${tablename}" t where row_to_json(t)::text like $1`,
      [`%${id}%`],
    );
    const count = Number(rows[0]?.count ?? 0);
    if (count > 0) found[tablename] = count;
  }
  return found;
};

const plan = (id: string, ownerId: string, status: string) => ({
  id,
  title: id,
  ownerId,
  mode: "live",
  status,
  filters: {},
  deck: ["a_1"],
});

// Человек со всем, что у него может быть: даты, свайпы, желание, брони в обе
// стороны, ссылка, «Выбери подарок сам», фото, свои занятия, друзья, планы и
// игры — свои и чужие, идущие и закончившиеся.
const fill = async (me: TestUser, other: TestUser) => {
  await server.request(me, "POST", "/me/dates", { date: "06-02" });
  await db.transaction((tx) =>
    makeFriends(tx, me.id, other.id, "plan", { now: () => NOW }),
  );
  await db.insert(schema.productSwipes).values({
    id: "sw_1",
    userId: me.id,
    productId: "p_0001",
    decision: "like",
    contextKey: "self",
    at,
  });
  await db.insert(schema.wishlistItems).values({
    id: "wi_1",
    ownerId: me.id,
    sourceKind: "product",
    productId: "p_0001",
    sortOrder: 0,
    addedAt: at,
  });
  await db.insert(schema.reservations).values([
    {
      id: "r_mine",
      ownerRef: other.id,
      itemKey: "p_0002",
      reserverId: me.id,
      reserverName: "Я",
      at,
    },
    {
      id: "r_on_me",
      ownerRef: me.id,
      itemKey: "p_0001",
      reserverId: other.id,
      reserverName: "Другой",
      at,
    },
  ]);
  await db.insert(schema.shareLinks).values({
    code: "abc123",
    kind: "wishlist",
    ownerId: me.id,
    targetId: me.id,
  });
  await db
    .insert(schema.pickRequests)
    .values({ id: "pr_1", fromUserId: me.id, filters: {} });
  await db.insert(schema.pickRequests).values({
    id: "pr_other",
    fromUserId: other.id,
    filters: {},
  });
  await db.insert(schema.pickAnswers).values({
    requestId: "pr_other",
    byUserId: me.id,
    picks: [],
    answeredAt: at,
  });
  await db.insert(schema.uploads).values({
    key: "up_1",
    ownerId: me.id,
    mime: "image/webp",
    bytes: 10,
  });
  await db.insert(schema.customActivities).values([
    { id: "ca_lonely", createdBy: me.id, activity: { id: "ca_lonely" } },
    {
      id: "ca_used",
      createdBy: me.id,
      activity: { id: "ca_used", imageKey: "up_1" },
      imageKey: "up_1",
    },
  ]);
  await db.insert(schema.identities).values({
    userId: me.id,
    provider: "telegram",
    subject: "tg_1",
  });

  await db.insert(schema.plans).values([
    // Свой план без других — удаляется.
    plan("pl_lonely", me.id, "lobby"),
    // Свой план с другим — остаётся другому.
    { ...plan("pl_shared", me.id, "results"), customActivityIds: ["ca_used"] },
    // Чужой закончившийся — строка «Удалённый профиль» остаётся.
    plan("pl_done", other.id, "decided"),
    // Чужой идущий — участника убираем.
    plan("pl_live", other.id, "swiping"),
  ]);
  const participant = (planId: string, userId: string) => ({
    planId,
    userId,
    joinedAt: at,
  });
  await db
    .insert(schema.planParticipants)
    .values([
      participant("pl_lonely", me.id),
      participant("pl_shared", me.id),
      participant("pl_shared", other.id),
      participant("pl_done", me.id),
      participant("pl_done", other.id),
      participant("pl_live", me.id),
      participant("pl_live", other.id),
    ]);
  await db.insert(schema.planSwipes).values([
    {
      planId: "pl_done",
      userId: me.id,
      activityId: "a_1",
      decision: "like",
      at,
    },
    {
      planId: "pl_done",
      userId: other.id,
      activityId: "a_1",
      decision: "like",
      at,
    },
  ]);
  await db.insert(schema.planVotes).values([
    { planId: "pl_done", userId: me.id, activityId: "a_1" },
    { planId: "pl_done", userId: other.id, activityId: "a_1" },
  ]);

  const game = (id: string, ownerId: string, status: string) => ({
    id,
    title: id,
    ownerId,
    budget: 1000,
    exchangeDate: "2026-12-25",
    status,
  });
  await db
    .insert(schema.santaGames)
    .values([
      game("sg_drawn", other.id, "drawn"),
      game("sg_gathering", other.id, "gathering"),
    ]);
  await db.insert(schema.santaMembers).values([
    { gameId: "sg_drawn", userId: me.id, state: "joined" },
    { gameId: "sg_drawn", userId: other.id, state: "joined" },
    { gameId: "sg_gathering", userId: me.id, state: "joined" },
    { gameId: "sg_gathering", userId: other.id, state: "joined" },
  ]);
  await db.insert(schema.santaAssignments).values([
    { gameId: "sg_drawn", santaId: me.id, wardId: other.id },
    { gameId: "sg_drawn", santaId: other.id, wardId: me.id },
  ]);
};

describe("DELETE /me (§3.4)", () => {
  it("остаются только обезличенные строки в чужих планах и играх", async () => {
    const me = await server.newUser({ name: "Удаляюсь", birthday: "03-14" });
    const other = await server.newUser({ name: "Остаюсь" });
    await fill(me, other);

    const response = await server.request(me, "DELETE", "/me");
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });

    expect(await rowsMentioning(me.id)).toEqual({
      users: 1,
      plans: 1, // pl_shared: организатор — обезличенный профиль
      plan_participants: 2, // pl_shared и pl_done
      santa_members: 1, // sg_drawn
      santa_assignments: 2, // пара после жеребьёвки
      custom_activities: 1, // ca_used — в колоде pl_shared, без фото
    });
    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, me.id));
    expect(user).toMatchObject({
      name: null,
      birthday: null,
      interests: [],
      taste: null,
      deletedAt: expect.any(Date),
    });
    const [activity] = await db
      .select()
      .from(schema.customActivities)
      .where(eq(schema.customActivities.id, "ca_used"));
    expect(activity).toMatchObject({
      imageKey: null,
      activity: { id: "ca_used" },
    });
    expect(await rowsMentioning("up_1")).toEqual({});

    // Свайпы и голоса другого — на месте; чужое не тронуто.
    expect(await db.select().from(schema.planSwipes)).toHaveLength(1);
    expect(await db.select().from(schema.planVotes)).toHaveLength(1);
    expect(await db.select().from(schema.pickRequests)).toHaveLength(1);

    // Токен больше не работает, профиль другому не виден.
    expect((await server.request(me, "GET", "/me")).statusCode).toBe(401);
    expect(
      (await server.request(other, "GET", `/users/${me.id}`)).statusCode,
    ).toBe(404);
    expect((await server.request(other, "GET", "/friends")).json()).toEqual([]);
  });

  it("без чужих планов и игр профиль удаляется целиком", async () => {
    const me = await server.newUser({ name: "Один" });
    await server.request(me, "POST", "/me/dates", { date: "06-02" });
    expect((await server.request(me, "DELETE", "/me")).statusCode).toBe(200);
    expect(await rowsMentioning(me.id)).toEqual({});
  });
});
