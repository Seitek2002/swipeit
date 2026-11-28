import { eq } from "drizzle-orm";
import { toDateKey } from "@swipeit/core/format";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { funnelDaily, users } from "../src/db/schema";
import {
  formatFunnel,
  readFunnel,
  readProfilesByVia,
} from "../src/domains/funnel/report";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer, makeClock, type TestUser } from "./server";

// Счётчики воронки (auto-tasks P09): шаг считается один раз на человека, в
// таблице счётчиков нет ни id, ни имён, ни кодов ссылок.
const database = createTestDb();
afterAll(() => database.close());

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeEach(async () => {
  await resetDb(database);
  server = await createTestServer(database);
});
afterEach(() => server.close());

const swipe = (user: TestUser, productId: string) =>
  server.request(user, "POST", "/swipes", {
    productId,
    decision: "like",
    context: { kind: "self" },
  });

const counts = async () =>
  Object.fromEntries(
    (await database.db.select().from(funnelDaily)).map((row) => [
      row.step,
      row.count,
    ]),
  );

// Сценарий B08 дважды подряд: всё, что можно повторить, повторено.
const scenario = async () => {
  const { products } = await testCatalog();
  const owner = await server.newUser({ name: "Айгерим", birthday: "03-14" });
  for (const product of products.slice(0, 6)) {
    await swipe(owner, product.id);
  }
  const { code } = (
    await server.request(owner, "POST", "/wishlist/share")
  ).json() as { code: string };
  await server.request(owner, "POST", "/wishlist/share");

  const guest = await server.newUser();
  await server.request(guest, "GET", `/share/${code}`);
  await server.request(guest, "GET", `/share/${code}`);
  const body = {
    ownerId: owner.id,
    itemKey: products[0]?.id ?? "",
    name: "Бакыт",
    share: code,
  };
  expect(
    (await server.request(guest, "POST", "/reservations", body)).statusCode,
  ).toBe(200);
  await server.request(guest, "POST", "/reservations", body);
  await swipe(guest, products[7]?.id ?? "");
  await swipe(guest, products[8]?.id ?? "");

  // Свайпает, но по ссылке не приходил — не «гость начал свайпать».
  const loner = await server.newUser();
  await swipe(loner, products[9]?.id ?? "");

  return { owner, guest, loner, code };
};

describe("воронка P09", () => {
  it("каждый шаг человека — один раз, повторы не растят счётчик", async () => {
    await scenario();
    expect(await counts()).toEqual({
      profile_created: 3,
      first_swipe: 3,
      share_unlocked: 1,
      wishlist_shared: 1,
      guest_opened: 1,
      reservation_created: 1,
      guest_first_swipe: 1,
      // У владельца: ссылка дошла, на вишлист забронировали (Q01).
      share_reached: 1,
      reservation_received: 1,
      // Q03: часы стоят — все трое свайпнули сразу; у владельца есть
      // день рождения.
      first_swipe_10s: 3,
      share_with_birthday: 1,
    });
    const rows = await database.db.select().from(funnelDaily);
    // День — по часам сервера, в момент действия.
    expect(new Set(rows.map((row) => row.day))).toEqual(
      new Set([toDateKey(NOW)]),
    );
  });

  it("Q01: новый гость без профиля → профиль при брони → свой вишлист отправлен: петля посчитана", async () => {
    const { products } = await testCatalog();
    const owner = await server.newUser({ name: "Айгерим", birthday: "03-14" });
    for (const product of products.slice(0, 5)) await swipe(owner, product.id);
    const { code } = (
      await server.request(owner, "POST", "/wishlist/share")
    ).json() as { code: string };

    // Открыл без профиля: шагов нет ни у кого.
    await server.request(null, "GET", `/share/${code}`);
    expect(await counts()).not.toHaveProperty("share_reached");

    // Профиль — при брони; экран гостя перечитывает ссылку уже с профилем.
    const created = (
      await server.request(null, "POST", "/users", { via: "reservation" })
    ).json() as { me: { id: string }; token: string };
    const guest = { id: created.me.id, token: created.token };
    await server.request(guest, "PATCH", "/me", { name: "Бакыт" });
    await server.request(guest, "POST", "/reservations", {
      ownerId: owner.id,
      itemKey: products[0]?.id ?? "",
      share: code,
    });
    await server.request(guest, "GET", `/share/${code}`);
    // Свой вишлист: 5 «Хочу» и отправка — дважды, счётчики не растут.
    for (const product of products.slice(10, 15))
      await swipe(guest, product.id);
    await server.request(guest, "POST", "/wishlist/share");
    await server.request(guest, "POST", "/wishlist/share");

    expect(await counts()).toMatchObject({
      guest_opened: 1,
      reservation_created: 1,
      guest_first_swipe: 1,
      guest_shared: 1,
      share_reached: 1,
      reservation_received: 1,
      wishlist_shared: 2,
    });
    const report = formatFunnel(
      await readFunnel(database.db, 14, NOW),
      14,
      await readProfilesByVia(database.db, 14, NOW),
    );
    expect(report).toContain("reservation: 1");
    expect(report).toContain("guest_first_swipe → guest_shared: 100% (1 из 1)");
  });

  it("Q01: владелец открыл свою ссылку — share_reached не ставится", async () => {
    const { products } = await testCatalog();
    const owner = await server.newUser({ name: "Айгерим" });
    for (const product of products.slice(0, 5)) await swipe(owner, product.id);
    const { code } = (
      await server.request(owner, "POST", "/wishlist/share")
    ).json() as { code: string };
    await server.request(owner, "GET", `/share/${code}`);
    expect(await counts()).not.toHaveProperty("share_reached");
  });

  it("Q02: «Выбери подарок сам» — создал, друг открыл, ответил дважды → по 1", async () => {
    const { products } = await testCatalog();
    const author = await server.newUser({ name: "Айгерим" });
    const made = (
      await server.request(author, "POST", "/pick-requests", {
        toName: "Нурай",
        filters: {
          budget: { min: 0, max: 100000 },
          categories: [],
          marketplaces: [],
        },
        hidePrices: false,
      })
    ).json() as { code: string; request: { id: string } };
    await server.request(author, "GET", `/share/${made.code}`);
    const friend = await server.newUser({ name: "Нурай" });
    await server.request(friend, "GET", `/share/${made.code}`);
    await server.request(friend, "POST", "/swipes", {
      productId: products[0]?.id ?? "",
      decision: "like",
      context: { kind: "pick", requestId: made.request.id },
    });
    for (let index = 0; index < 2; index += 1) {
      const answer = await server.request(
        friend,
        "POST",
        `/pick-requests/${made.request.id}/answer`,
      );
      expect(answer.statusCode).toBe(200);
    }
    expect(await counts()).toMatchObject({
      pick_created: 1,
      pick_opened: 1,
      pick_answered: 1,
    });
  });

  it("Q02: план на троих — одна компания и после «Отменить решение»; на двоих — не компания", async () => {
    const owner = await server.newUser({ name: "Айгерим" });
    const make = async (others: TestUser[]) => {
      const created = (
        await server.request(owner, "POST", "/plans", {
          title: "Пятница",
          mode: "live",
          participantIds: [],
          filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
        })
      ).json() as { plan: { id: string } };
      const id = created.plan.id;
      for (const other of others) {
        await server.request(other, "POST", `/plans/${id}/join`);
        await server.request(other, "POST", `/plans/${id}/ready`, {
          ready: true,
        });
      }
      const started = (
        await server.request(owner, "POST", `/plans/${id}/start`)
      ).json() as { plan: { deck: string[] } };
      for (const member of [owner, ...others]) {
        await server.request(member, "POST", `/plans/${id}/finish`);
      }
      const decide = () =>
        server.request(owner, "POST", `/plans/${id}/decide`, {
          method: "owner",
          activityId: started.plan.deck[0],
        });
      expect((await decide()).statusCode).toBe(200);
      return { id, decide };
    };
    const three = await make([
      await server.newUser({ name: "Азамат" }),
      await server.newUser({ name: "Нурай" }),
    ]);
    await server.request(owner, "POST", `/plans/${three.id}/decide/cancel`);
    expect((await three.decide()).statusCode).toBe(200);
    await make([await server.newUser({ name: "Бакыт" })]);
    expect(await counts()).toMatchObject({
      plan_created: 1,
      plan_joined: 3,
      plan_started_group: 2,
      plan_decided_group: 1,
    });
  });

  it("Q02: Санта на 4 — одна разыгранная компания, четыре вскрытых письма", async () => {
    const owner = await server.newUser({ name: "Айгерим" });
    const created = (
      await server.request(owner, "POST", "/santa", {
        title: "Офис",
        budget: 2000,
        exchangeDate: "2026-12-25",
        participantIds: [],
      })
    ).json() as { game: { id: string } };
    const id = created.game.id;
    const others: TestUser[] = [];
    for (const name of ["Азамат", "Нурай", "Бакыт"]) {
      const other = await server.newUser({ name });
      await server.request(other, "POST", `/santa/${id}/join`);
      others.push(other);
    }
    await server.request(owner, "POST", `/santa/${id}/draw`);
    for (const member of [owner, ...others]) {
      await server.request(member, "POST", `/santa/${id}/open`);
      await server.request(member, "POST", `/santa/${id}/open`);
    }
    const counted = await counts();
    expect(counted).toMatchObject({
      santa_created: 1,
      santa_joined: 3,
      santa_drawn_group: 1,
      envelope_opened: 4,
      // Вишлисты пустые — у всех Сант мало желаний в бюджете.
      ward_empty: 4,
    });
    const report = formatFunnel(await readFunnel(database.db, 14, NOW), 14);
    expect(report).toContain(
      "Компаний (план на 3+ решён или Санта разыграна) за период: 1",
    );
  });

  describe("Q03", () => {
    it("свой профиль команды не считается; снял пометку — считается", async () => {
      const { products } = await testCatalog();
      const team = await server.newUser({ name: "Команда" });
      const before = await counts();
      await database.db
        .update(users)
        .set({ funnelInternal: true })
        .where(eq(users.id, team.id));
      for (const product of products.slice(0, 5)) await swipe(team, product.id);
      await server.request(team, "POST", "/wishlist/share");
      expect(await counts()).toEqual(before);
      await database.db
        .update(users)
        .set({ funnelInternal: false })
        .where(eq(users.id, team.id));
      await swipe(team, products[6]?.id ?? "");
      expect((await counts()).first_swipe).toBe(1);
    });

    it("первый свайп через 9 с — first_swipe_10s, через 11 с — нет", async () => {
      const { products } = await testCatalog();
      const clock = makeClock();
      await server.close();
      server = await createTestServer(database, clock);
      const quick = await server.newUser();
      clock.advance(9_000);
      await swipe(quick, products[0]?.id ?? "");
      const slow = await server.newUser();
      clock.advance(11_000);
      await swipe(slow, products[0]?.id ?? "");
      expect(await counts()).toMatchObject({
        first_swipe: 2,
        first_swipe_10s: 1,
      });
    });

    it("20-й свайп — swipes_20; «Вернуть» и снова свайп не считаются второй раз", async () => {
      const { products } = await testCatalog();
      const user = await server.newUser();
      for (const product of products.slice(0, 19)) {
        await server.request(user, "POST", "/swipes", {
          productId: product.id,
          decision: "pass",
          context: { kind: "self" },
        });
      }
      expect(await counts()).not.toHaveProperty("swipes_20");
      const twentieth = products[19]?.id ?? "";
      await server.request(user, "POST", "/swipes", {
        productId: twentieth,
        decision: "pass",
        context: { kind: "self" },
      });
      await server.request(user, "POST", "/swipes/undo", {
        context: { kind: "self" },
      });
      await server.request(user, "POST", "/swipes", {
        productId: twentieth,
        decision: "pass",
        context: { kind: "self" },
      });
      expect((await counts()).swipes_20).toBe(1);
    });

    it("отправка с днём рождения — share_with_birthday; без даты — нет", async () => {
      const { products } = await testCatalog();
      const withBirthday = await server.newUser({
        name: "Айгерим",
        birthday: "03-14",
      });
      const without = await server.newUser({ name: "Бакыт" });
      for (const person of [withBirthday, without]) {
        for (const product of products.slice(0, 5))
          await swipe(person, product.id);
        await server.request(person, "POST", "/wishlist/share");
      }
      expect(await counts()).toMatchObject({
        wishlist_shared: 2,
        share_with_birthday: 1,
      });
    });
  });

  it("R06: участник Санты собрал три желания — santa_member_wishlist; не участник — нет", async () => {
    const { products } = await testCatalog();
    const owner = await server.newUser({ name: "Айгерим" });
    const created = (
      await server.request(owner, "POST", "/santa", {
        title: "Офис",
        budget: 5000,
        exchangeDate: "2026-12-25",
        participantIds: [],
      })
    ).json() as { game: { id: string } };
    const member = await server.newUser({ name: "Азамат" });
    await server.request(member, "POST", `/santa/${created.game.id}/join`);
    const outsider = await server.newUser({ name: "Чужой" });
    for (const person of [member, outsider]) {
      for (const product of products.slice(0, 4))
        await swipe(person, product.id);
    }
    expect((await counts()).santa_member_wishlist).toBe(1);
  });

  it("R04: жеребьёвка с тёзками — santa_drawn_with_namesakes 1, без тёзок — 0", async () => {
    const game = async (names: string[]) => {
      const owner = await server.newUser({ name: "Айгерим" });
      const created = (
        await server.request(owner, "POST", "/santa", {
          title: "Офис",
          budget: 2000,
          exchangeDate: "2026-12-25",
          participantIds: [],
        })
      ).json() as { game: { id: string } };
      for (const name of names) {
        const member = await server.newUser({ name });
        await server.request(member, "POST", `/santa/${created.game.id}/join`);
      }
      await server.request(owner, "POST", `/santa/${created.game.id}/draw`);
    };
    await game(["Азамат", "Нурай"]);
    expect((await counts()).santa_drawn_with_namesakes).toBeUndefined();
    await game(["Азамат", "азамат "]);
    expect((await counts()).santa_drawn_with_namesakes).toBe(1);
  });

  it("R09: шаги клиента — по одному на человека, неизвестный шаг — VALIDATION, без профиля — 401", async () => {
    const first = await server.newUser({ name: "Айгерим" });
    const second = await server.newUser({ name: "Азамат" });
    const step = (user: TestUser | null, name: string) =>
      server.request(user, "POST", "/me/funnel", { step: name });
    expect((await step(first, "share_channel_copy")).statusCode).toBe(200);
    await step(first, "share_channel_copy");
    await step(second, "share_channel_copy");
    await step(second, "in_app_browser_seen");
    const wrong = await step(first, "hacked_step");
    expect(wrong.statusCode).toBe(400);
    expect(wrong.json()).toMatchObject({ code: "VALIDATION" });
    expect((await step(null, "offline_seen")).statusCode).toBe(401);
    const after = await counts();
    expect(after.share_channel_copy).toBe(2);
    expect(after.in_app_browser_seen).toBe(1);
    expect(after.offline_seen).toBeUndefined();
    expect(after.hacked_step).toBeUndefined();
  });

  it("в funnel_daily нет id людей, имён и кодов ссылок", async () => {
    const { owner, guest, loner, code } = await scenario();
    const { rows } = await database.pool.query<{ row: string }>(
      "select row_to_json(t)::text as row from funnel_daily t",
    );
    const text = rows.map((row) => row.row).join("\n");
    expect(rows.length).toBeGreaterThan(0);
    for (const secret of [
      owner.id,
      guest.id,
      loner.id,
      code,
      "Айгерим",
      "Бакыт",
    ]) {
      expect(text).not.toContain(secret);
    }
    const { rows: columns } = await database.pool.query<{ name: string }>(
      `select column_name as name from information_schema.columns
       where table_name = 'funnel_daily' order by column_name`,
    );
    expect(columns.map((column) => column.name)).toEqual([
      "count",
      "day",
      "step",
    ]);
  });

  it("отчёт: таблица по дням и конверсии", async () => {
    await scenario();
    const report = formatFunnel(await readFunnel(database.db, 14, NOW), 14);
    expect(report).toContain("Воронка за 14 дн.");
    expect(report).toMatch(/profile_created\s+3\s+3/);
    expect(report).toContain(
      "guest_opened → reservation_created: 100% (1 из 1)",
    );
    expect(report).toContain("plan_created → plan_decided: — (0 из 0)");
  });
});
