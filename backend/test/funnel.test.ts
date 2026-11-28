import { toDateKey } from "@swipeit/core/format";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { funnelDaily } from "../src/db/schema";
import {
  formatFunnel,
  readFunnel,
  readProfilesByVia,
} from "../src/domains/funnel/report";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer, type TestUser } from "./server";

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
