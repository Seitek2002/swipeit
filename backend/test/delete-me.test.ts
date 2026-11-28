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
      plan_participants: 2, // pl_shared и pl_done
      // Из игр Санты уходит совсем: в sg_drawn они дарили друг другу —
      // у другого теперь нет подопечного (Q05).
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
    // Организатор pl_shared — тот, кто вступил следующим (Q04).
    const [shared] = await db
      .select()
      .from(schema.plans)
      .where(eq(schema.plans.id, "pl_shared"));
    expect(shared?.ownerId).toBe(other.id);
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

  it("Q04: организатор плана на троих удалил профиль — организатор второй вступивший, план идёт дальше", async () => {
    const owner = await server.newUser({ name: "Организатор" });
    const second = await server.newUser({ name: "Второй" });
    const third = await server.newUser({ name: "Третий" });
    const created = (
      await server.request(owner, "POST", "/plans", {
        title: "Пятница",
        mode: "live",
        participantIds: [],
        filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
      })
    ).json() as { plan: { id: string } };
    const id = created.plan.id;
    expect(
      (await server.request(second, "POST", `/plans/${id}/join`)).statusCode,
    ).toBe(200);
    await server.request(third, "POST", `/plans/${id}/join`);
    await server.request(third, "POST", `/plans/${id}/ready`, { ready: true });

    expect((await server.request(owner, "DELETE", "/me")).statusCode).toBe(200);

    const view = (
      await server.request(second, "GET", `/plans/${id}`)
    ).json() as {
      plan: { ownerId: string; participantIds: string[]; readyIds: string[] };
    };
    expect(view.plan.ownerId).toBe(second.id);
    expect(view.plan.participantIds).toEqual([second.id, third.id]);
    expect([...view.plan.readyIds].sort()).toEqual(
      [second.id, third.id].sort(),
    );
    // Новый организатор может запустить план.
    const started = await server.request(second, "POST", `/plans/${id}/start`);
    expect(started.statusCode).toBe(200);
    // В базе удалённый профиль больше не организатор ни одного плана.
    expect(
      await db
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.ownerId, owner.id)),
    ).toEqual([]);
  });

  it("Q04: организатор был в плане один — плана нет", async () => {
    const owner = await server.newUser({ name: "Один" });
    const created = (
      await server.request(owner, "POST", "/plans", {
        title: "Сам",
        mode: "live",
        participantIds: [],
        filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
      })
    ).json() as { plan: { id: string } };
    await server.request(owner, "DELETE", "/me");
    expect(
      await db
        .select()
        .from(schema.plans)
        .where(eq(schema.plans.id, created.plan.id)),
    ).toEqual([]);
  });

  describe("Q05: Санта после жеребьёвки, удалён профиль", () => {
    // Игра на n человек, все вступили, жеребьёвка; пары — из базы.
    const drawnGame = async (n: number) => {
      const owner = await server.newUser({ name: "Организатор" });
      const others: TestUser[] = [];
      for (let index = 1; index < n; index += 1) {
        const friend = await server.newUser({ name: `Участник ${index}` });
        await db.transaction((tx) =>
          makeFriends(tx, owner.id, friend.id, "santa", { now: () => NOW }),
        );
        others.push(friend);
      }
      const created = (
        await server.request(owner, "POST", "/santa", {
          title: "Офис",
          budget: 2000,
          exchangeDate: "2026-12-25",
          participantIds: others.map((friend) => friend.id),
        })
      ).json() as { game: { id: string } };
      const id = created.game.id;
      for (const friend of others) {
        await server.request(friend, "POST", `/santa/${id}/join`);
      }
      await server.request(owner, "POST", `/santa/${id}/draw`);
      const everyone = [owner, ...others];
      return { id, owner, everyone };
    };
    const pairsOf = async (id: string) =>
      Object.fromEntries(
        (
          await db
            .select()
            .from(schema.santaAssignments)
            .where(eq(schema.santaAssignments.gameId, id))
        ).map((row) => [row.santaId, row.wardId]),
      );
    const viewOf = async (user: TestUser, id: string) =>
      (await server.request(user, "GET", `/santa/${id}`)).json() as {
        game: { ownerId: string; participantIds: string[] };
        me: null | {
          envelope: string;
          ward: null | { id: string };
          wardLeft?: boolean;
        };
      };

    it("пятеро, удалён D: его Санта дарит его подопечному, письмо снова запечатано, остальные пары те же", async () => {
      const { id, everyone } = await drawnGame(5);
      for (const member of everyone) {
        await server.request(member, "POST", `/santa/${id}/open`);
      }
      const before = await pairsOf(id);
      const leaver = everyone[3] as TestUser;
      const santa = Object.keys(before).find((s) => before[s] === leaver.id);
      const ward = before[leaver.id];
      expect((await server.request(leaver, "DELETE", "/me")).statusCode).toBe(
        200,
      );
      const after = await pairsOf(id);
      expect(after[santa ?? ""]).toBe(ward);
      expect(Object.keys(after)).toHaveLength(4);
      for (const [giver, receiver] of Object.entries(before)) {
        if (giver === santa || giver === leaver.id) continue;
        expect(after[giver]).toBe(receiver);
      }
      const santaUser = everyone.find((m) => m.id === santa) as TestUser;
      const view = await viewOf(santaUser, id);
      expect(view.me?.envelope).toBe("ready");
      expect(view.me?.ward?.id).toBe(ward);
      expect(view.game.participantIds).not.toContain(leaver.id);
    });

    it("пара двоих внутри игры на 4 — удалён один, у второго нет подопечного (wardLeft)", async () => {
      // Пары случайные: ищем игру, где есть взаимная пара.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        const { id, everyone } = await drawnGame(4);
        const pairs = await pairsOf(id);
        const a = Object.keys(pairs).find((s) => pairs[pairs[s] ?? ""] === s);
        if (!a) continue;
        const b = pairs[a] ?? "";
        const leaver = everyone.find((m) => m.id === b) as TestUser;
        await server.request(leaver, "DELETE", "/me");
        const after = await pairsOf(id);
        expect(after[a]).toBeUndefined();
        for (const [giver, receiver] of Object.entries(pairs)) {
          if (giver === a || giver === b) continue;
          expect(after[giver]).toBe(receiver);
        }
        const aUser = everyone.find((m) => m.id === a) as TestUser;
        const view = await viewOf(aUser, id);
        expect(view.me?.ward).toBeNull();
        expect(view.me?.wardLeft).toBe(true);
        return;
      }
      throw new Error("За 20 жеребьёвок не нашлось взаимной пары");
    }, 120_000);

    it("организатор игры удалил профиль — организатор тот, кто вступил следующим", async () => {
      const { id, owner, everyone } = await drawnGame(4);
      await server.request(owner, "DELETE", "/me");
      const second = everyone[1] as TestUser;
      const view = await viewOf(second, id);
      expect(view.game.ownerId).toBe(second.id);
    });
  });

  it("без чужих планов и игр профиль удаляется целиком", async () => {
    const me = await server.newUser({ name: "Один" });
    await server.request(me, "POST", "/me/dates", { date: "06-02" });
    expect((await server.request(me, "DELETE", "/me")).statusCode).toBe(200);
    expect(await rowsMentioning(me.id)).toEqual({});
  });
});
