import type {
  SwipeResponse,
  WishlistItem,
  WishlistResponse,
} from "@swipeit/core/api/wishlist/types";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { reservations } from "../src/db/schema";
import { makeFriends } from "../src/domains/friends/handlers";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer, makeClock, type TestUser } from "./server";

// Вишлист на сервере (B07) — то, чего нет в моке: блокировка записей,
// «Отменить» по deleted_at, брони при «Мне это подарили».
const database = createTestDb();
afterAll(() => database.close());

let clock: ReturnType<typeof makeClock>;
let server: Awaited<ReturnType<typeof createTestServer>>;
beforeEach(async () => {
  await resetDb(database);
  clock = makeClock();
  server = await createTestServer(database, clock);
});
afterEach(() => server.close());

const like = async (user: TestUser, productId: string) =>
  (
    await server.request(user, "POST", "/swipes", {
      productId,
      decision: "like",
      context: { kind: "self" },
    })
  ).json() as SwipeResponse;

const wishlist = async (user: TestUser) =>
  (await server.request(user, "GET", "/wishlist")).json() as WishlistResponse;

describe("порядок под блокировкой (§2.6)", () => {
  it("одновременные reorder и POST /swipes одного человека не ломают порядок", async () => {
    const { products } = await testCatalog();
    const me = await server.newUser();
    for (const product of products.slice(0, 5)) await like(me, product.id);
    const start = (await wishlist(me)).items.map((item) => item.id);

    // Порядок задаёт клиент — пока свайпы ещё идут.
    const jobs: Array<Promise<unknown>> = [];
    for (const [index, product] of products.slice(5, 15).entries()) {
      jobs.push(like(me, product.id));
      jobs.push(
        server.request(me, "POST", "/wishlist/reorder", {
          ids: index % 2 ? [...start].reverse() : start,
        }),
      );
    }
    const responses = await Promise.all(jobs);
    expect(responses).toHaveLength(20);

    const { items } = await wishlist(me);
    expect(items).toHaveLength(15);
    // Номера — без повторов и дыр: 0…14.
    expect(items.map((item) => item.order)).toEqual(
      Array.from({ length: 15 }, (_, index) => index),
    );
    expect(new Set(items.map((item) => item.id)).size).toBe(15);
  });
});

describe("«Отменить» удаление (§4.4)", () => {
  it("без тела, в течение 10 минут; потом — NOT_FOUND", async () => {
    const me = await server.newUser();
    const { wishlistItemId: id } = await like(me, "p_0001");
    await server.request(me, "DELETE", `/wishlist/items/${id}`);
    clock.advance(9 * 60_000);
    const back = await server.request(
      me,
      "POST",
      `/wishlist/items/${id}/undelete`,
    );
    expect(back.statusCode).toBe(200);
    expect((back.json() as WishlistItem).id).toBe(id);
    // Повтор — ничего не меняет.
    expect(
      (await server.request(me, "POST", `/wishlist/items/${id}/undelete`))
        .statusCode,
    ).toBe(200);

    await server.request(me, "DELETE", `/wishlist/items/${id}`);
    clock.advance(10 * 60_000 + 1);
    const late = await server.request(
      me,
      "POST",
      `/wishlist/items/${id}/undelete`,
    );
    expect(late.statusCode).toBe(404);
    expect((await wishlist(me)).items).toEqual([]);
  });

  it("пока удалённое ждало, товар лайкнули снова — остаётся одно желание", async () => {
    const me = await server.newUser();
    const { wishlistItemId: old } = await like(me, "p_0001");
    await server.request(me, "DELETE", `/wishlist/items/${old}`);
    const { wishlistItemId: fresh } = await like(me, "p_0001");
    expect(fresh).not.toBe(old);
    const back = await server.request(
      me,
      "POST",
      `/wishlist/items/${old}/undelete`,
    );
    expect((back.json() as WishlistItem).id).toBe(fresh);
    expect((await wishlist(me)).items.map((item) => item.id)).toEqual([fresh]);
  });
});

describe("«Мне это подарили» и брони", () => {
  it("закрывает бронь, «Отменить» сразу после — снова открывает; кто бронировал, владельцу не виден", async () => {
    const me = await server.newUser({ name: "Айпери" });
    const friend = await server.newUser({ name: "Бакыт" });
    const { wishlistItemId: id } = await like(me, "p_0001");
    await database.db.insert(reservations).values({
      id: "r_1",
      ownerRef: me.id,
      itemKey: "p_0001",
      reserverId: friend.id,
      reserverName: "Бакыт",
      at: new Date(NOW),
    });
    const before = await server.request(me, "GET", "/wishlist");
    expect(before.json()).toMatchObject({ reservationCount: 1 });
    // §4.6, п. 1: ни имени, ни id бронирующего.
    expect(before.body).not.toContain("Бакыт");
    expect(before.body).not.toContain(friend.id);

    await server.request(me, "POST", `/wishlist/items/${id}/given`, {
      at: new Date(NOW).toISOString(),
    });
    const closed = async () =>
      (
        await database.db
          .select()
          .from(reservations)
          .where(eq(reservations.id, "r_1"))
      )[0]?.closedAt;
    expect(await closed()).not.toBeNull();
    expect((await wishlist(me)).reservationCount).toBe(0);

    await server.request(me, "POST", `/wishlist/items/${id}/restore`, {
      undo: true,
    });
    expect(await closed()).toBeNull();
    expect((await wishlist(me)).reservationCount).toBe(1);
  });

  it("отметить дарителем можно только друга", async () => {
    const me = await server.newUser({ name: "Айпери" });
    const stranger = await server.newUser({ name: "Чужой" });
    const { wishlistItemId: id } = await like(me, "p_0001");
    const at = new Date(NOW).toISOString();
    const bad = await server.request(
      me,
      "POST",
      `/wishlist/items/${id}/given`,
      {
        fromUserId: stranger.id,
        at,
      },
    );
    expect(bad.statusCode).toBe(400);
    await database.db.transaction((tx) =>
      makeFriends(tx, me.id, stranger.id, "plan", clock),
    );
    const ok = await server.request(me, "POST", `/wishlist/items/${id}/given`, {
      fromUserId: stranger.id,
      at,
    });
    expect((ok.json() as WishlistItem).given).toEqual({
      fromUserId: stranger.id,
      at,
    });
  });

  it("своё желание с чужим или несуществующим фото — VALIDATION", async () => {
    const me = await server.newUser();
    const response = await server.request(me, "POST", "/wishlist/items", {
      title: "Шарф",
      imageKey: "up_nope",
    });
    expect(response.statusCode).toBe(400);
    expect(response.json()).toMatchObject({ code: "VALIDATION" });
  });
});
