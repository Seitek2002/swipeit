import type {
  GuestWishlist,
  ReservationsView,
  SwipeResponse,
  WishlistResponse,
} from "@swipeit/core/api/wishlist/types";
import { encodeWishlist } from "@swipeit/core/share-codec";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  planParticipants,
  plans,
  reservations,
  uploads,
} from "../src/db/schema";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer, makeClock, type TestUser } from "./server";

// Короткие ссылки, гостевой вишлист и брони (BACKEND.md B08).
const database = createTestDb();
afterAll(() => database.close());

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeEach(async () => {
  await resetDb(database);
  server = await createTestServer(database);
});
afterEach(() => server.close());

type Share = { code: string; url: string };

// Владелец с именем и 5 «Хочу» — отправка открыта.
const readyOwner = async (name: null | string = "Айгерим") => {
  const { products } = await testCatalog();
  const owner = await server.newUser(
    name ? { name, birthday: "03-14" } : { birthday: "03-14" },
  );
  const ids: string[] = [];
  for (const product of products.slice(0, 5)) {
    const swipe = (
      await server.request(owner, "POST", "/swipes", {
        productId: product.id,
        decision: "like",
        context: { kind: "self" },
      })
    ).json() as SwipeResponse;
    ids.push(swipe.wishlistItemId ?? "");
  }
  return { owner, productIds: products.slice(0, 5).map((p) => p.id), ids };
};

const share = async (owner: TestUser) =>
  (await server.request(owner, "POST", "/wishlist/share")).json() as Share;

const reserve = (
  user: TestUser,
  body: { itemKey: string; name?: string; ownerId: string; share?: string },
) => server.request(user, "POST", "/reservations", body);

const reservationsOf = async (user: TestUser, ownerId: string, code?: string) =>
  (
    await server.request(
      user,
      "GET",
      `/reservations?ownerId=${encodeURIComponent(ownerId)}${code ? `&share=${code}` : ""}`,
    )
  ).json() as ReservationsView;

describe("отправка короткой ссылкой (§6.2)", () => {
  it("до 5 «Хочу» — FORBIDDEN, без имени — NAME_REQUIRED; повтор — та же ссылка", async () => {
    const early = await server.newUser({ name: "Рано" });
    expect(
      (await server.request(early, "POST", "/wishlist/share")).statusCode,
    ).toBe(403);

    const { owner: nameless } = await readyOwner(null);
    const noName = await server.request(nameless, "POST", "/wishlist/share");
    expect(noName.json()).toMatchObject({ code: "NAME_REQUIRED" });

    const { owner } = await readyOwner();
    const first = await share(owner);
    expect(first.code).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(first.url).toBe(`http://localhost:4100/s/${first.code}`);
    expect(await share(owner)).toEqual(first);
  });

  it("неизвестный код — 404 «Ссылка больше не работает»", async () => {
    const response = await server.request(null, "GET", "/share/AAAAAAAAAA");
    expect(response.statusCode).toBe(404);
    expect(response.json().message).toBe("Ссылка больше не работает");
  });
});

describe("сценарий B08: отправил → забронировали → подарили", () => {
  it("гость A бронирует, гость B видит «занято», у владельца счётчик 1, после «подарили» A видит «Уже подарено»", async () => {
    const { owner, productIds, ids } = await readyOwner();
    const { code } = await share(owner);

    // Гость A без имени открывает ссылку.
    const guestA = await server.newUser();
    const opened = await server.request(guestA, "GET", `/share/${code}`);
    expect(opened.statusCode).toBe(200);
    const { kind, ownerId, wishlist } = opened.json() as {
      kind: string;
      ownerId: string;
      wishlist: GuestWishlist;
    };
    expect(kind).toBe("wishlist");
    expect(ownerId).toBe(owner.id);
    expect(wishlist.owner).toEqual({
      name: "Айгерим",
      avatarColor: expect.any(String),
      userId: owner.id,
    });
    expect(wishlist.items.map((item) => item.key)).toEqual(productIds);

    // Бронь по коду; имя из формы остаётся в профиле (§3.1).
    const key = productIds[0] ?? "";
    const made = await reserve(guestA, {
      ownerId,
      itemKey: key,
      name: "Бакыт",
      share: code,
    });
    expect(made.statusCode).toBe(200);
    expect(
      ((await server.request(guestA, "GET", "/me")).json() as { name: string })
        .name,
    ).toBe("Бакыт");
    // Повтор своей брони — та же бронь.
    expect(
      (await reserve(guestA, { ownerId, itemKey: key, share: code })).json().id,
    ).toBe(made.json().id);

    // Гость B видит «занято» и не может забронировать то же.
    const guestB = await server.newUser({ name: "Нурай" });
    await server.request(guestB, "GET", `/share/${code}`);
    const seenByB = await reservationsOf(guestB, ownerId, code);
    expect(seenByB).toEqual({
      role: "guest",
      items: [{ id: made.json().id, itemKey: key, mine: false, closed: false }],
    });
    const second = await reserve(guestB, {
      ownerId,
      itemKey: key,
      share: code,
    });
    expect(second.statusCode).toBe(409);
    expect(second.json()).toMatchObject({ code: "CONFLICT" });

    // Владелец — только счётчик.
    expect(await reservationsOf(owner, owner.id)).toEqual({
      role: "owner",
      count: 1,
    });
    expect(
      (
        (
          await server.request(owner, "GET", "/wishlist")
        ).json() as WishlistResponse
      ).reservationCount,
    ).toBe(1);

    // «Мне это подарили» → у A «Уже подарено».
    await server.request(owner, "POST", `/wishlist/items/${ids[0]}/given`, {
      at: new Date(NOW).toISOString(),
    });
    const seenByA = await reservationsOf(guestA, ownerId, code);
    expect(seenByA.role === "guest" && seenByA.items).toEqual([
      { id: made.json().id, itemKey: key, mine: true, closed: true },
    ]);
    // Подаренное больше не бронируется.
    expect(
      (await reserve(guestB, { ownerId, itemKey: key, share: code }))
        .statusCode,
    ).toBe(409);
  });

  it("открывший ссылку с профилем — друг владельцу (§4.3); видит вишлист по id", async () => {
    const { owner } = await readyOwner();
    const { code } = await share(owner);
    const stranger = await server.newUser({ name: "Бакыт" });
    expect(
      (await server.request(stranger, "GET", `/users/${owner.id}/wishlist`))
        .statusCode,
    ).toBe(404);
    await server.request(stranger, "GET", `/share/${code}`);
    const friends = (await server.request(owner, "GET", "/friends")).json();
    expect(friends).toEqual([
      expect.objectContaining({
        user: expect.objectContaining({ id: stranger.id }),
      }),
    ]);
    const view = await server.request(
      stranger,
      "GET",
      `/users/${owner.id}/wishlist`,
    );
    expect(view.statusCode).toBe(200);
    expect((view.json() as GuestWishlist).items).toHaveLength(5);
    // Без профиля дружбы нет, но вишлист открывается.
    expect(
      (await server.request(null, "GET", `/share/${code}`)).statusCode,
    ).toBe(200);
  });

  it("фото своего желания — в гостевом виде (ссылка живая)", async () => {
    const { owner } = await readyOwner();
    await database.db.insert(uploads).values({
      key: "up_photo",
      ownerId: owner.id,
      mime: "image/webp",
      bytes: 100,
    });
    await server.request(owner, "POST", "/wishlist/items", {
      title: "Шарф",
      imageKey: "up_photo",
    });
    const { code } = await share(owner);
    const { wishlist } = (
      await server.request(null, "GET", `/share/${code}`)
    ).json() as {
      wishlist: GuestWishlist;
    };
    expect(wishlist.items.at(-1)?.custom).toEqual({
      title: "Шарф",
      imageKey: "up_photo",
    });
  });
});

describe("§4.6 п. 1 — владелец не узнаёт, кто бронировал", () => {
  it("ни в одном ответе владельцу нет имени и id бронирующего", async () => {
    const { owner, productIds } = await readyOwner();
    const { code } = await share(owner);
    const guest = await server.newUser({ name: "Тайный Даритель" });
    await server.request(guest, "GET", `/share/${code}`);
    await reserve(guest, {
      ownerId: owner.id,
      itemKey: productIds[1] ?? "",
      share: code,
    });
    await server.request(owner, "PATCH", "/wishlist/meta", {
      occasion: { kind: "march_8" },
    });
    const answers = [
      await server.request(owner, "GET", "/wishlist"),
      await server.request(owner, "GET", `/reservations?ownerId=${owner.id}`),
      await server.request(owner, "GET", `/share/${code}`),
      await server.request(owner, "GET", "/me"),
      await server.request(owner, "GET", `/users/${owner.id}`),
    ];
    for (const answer of answers) {
      expect(answer.statusCode).toBe(200);
      expect(answer.body).not.toContain("Тайный Даритель");
      expect(answer.body).not.toContain(guest.id);
      expect(answer.body).not.toContain("reserver");
    }
    // Другим гостям имени тоже нет — только «занято».
    const other = await server.newUser({ name: "Другой" });
    const seen = await server.request(
      other,
      "GET",
      `/reservations?ownerId=${owner.id}&share=${code}`,
    );
    expect(seen.body).not.toContain("Тайный Даритель");
    expect(seen.body).not.toContain(guest.id);
  });
});

describe("гонка броней (§2.6)", () => {
  it("20 одновременных броней одного желания — одна успешна, 19 CONFLICT", async () => {
    const { owner, productIds } = await readyOwner();
    const { code } = await share(owner);
    const guests: TestUser[] = [];
    for (let index = 0; index < 20; index += 1) {
      guests.push(await server.newUser({ name: `Гость ${index}` }));
    }
    const answers = await Promise.all(
      guests.map((guest) =>
        reserve(guest, {
          ownerId: owner.id,
          itemKey: productIds[2] ?? "",
          share: code,
        }),
      ),
    );
    const statuses = answers.map((answer) => answer.statusCode).sort();
    expect(statuses.filter((status) => status === 200)).toHaveLength(1);
    expect(statuses.filter((status) => status === 409)).toHaveLength(19);
    const rows = await database.db
      .select()
      .from(reservations)
      .where(eq(reservations.ownerRef, owner.id));
    expect(rows).toHaveLength(1);
  });
});

describe("старые длинные ссылки (§6.4)", () => {
  it("снимок разбирается без записи в базу; брони по нему — под ext:, владелец их не видит", async () => {
    const encoded = encodeWishlist({
      owner: { name: "Старый", avatarColor: "mint" },
      items: [{ productId: "p_0001", priority: "normal" }],
    });
    const guest = await server.newUser({ name: "Гость" });
    const external = (
      await server.request(null, "POST", "/external-wishlists", { encoded })
    ).json() as { id: string; items: Array<{ key: string }> };
    expect(external.id).toMatch(/^ew_/);
    expect(await database.db.select().from(reservations)).toEqual([]);

    const made = await reserve(guest, {
      ownerId: external.id,
      itemKey: external.items[0]?.key ?? "",
    });
    expect(made.statusCode).toBe(200);
    const [row] = await database.db.select().from(reservations);
    expect(row?.ownerRef).toBe(`ext:${external.id}`);
    const other = await server.newUser({ name: "Другой" });
    const seen = await reservationsOf(other, external.id);
    expect(seen.role === "guest" && seen.items).toEqual([
      expect.objectContaining({ mine: false, closed: false }),
    ]);
    expect(
      (
        await server.request(null, "POST", "/external-wishlists", {
          encoded: "битая",
        })
      ).statusCode,
    ).toBe(400);
  });

  it("подделанная старая ссылка с id настоящего владельца бронирует только с доступом", async () => {
    const { owner, productIds } = await readyOwner();
    const forger = await server.newUser({ name: "Хитрый" });
    const key = productIds[0] ?? "";
    const forged = await reserve(forger, { ownerId: owner.id, itemKey: key });
    expect(forged.statusCode).toBe(403);
    // Чужой или неверный код не помогает.
    const wrong = await reserve(forger, {
      ownerId: owner.id,
      itemKey: key,
      share: "AAAAAAAAAA",
    });
    expect(wrong.statusCode).toBe(403);
    // Без доступа и брони не видны — пустой список, как у несуществующего.
    expect(await reservationsOf(forger, owner.id)).toEqual({
      role: "guest",
      items: [],
    });
    expect(await database.db.select().from(reservations)).toEqual([]);

    // С кодом настоящей ссылки — можно.
    const { code } = await share(owner);
    expect(
      (await reserve(forger, { ownerId: owner.id, itemKey: key, share: code }))
        .statusCode,
    ).toBe(200);
    // Несуществующее желание — 404, своё — 403.
    expect(
      (
        await reserve(forger, {
          ownerId: owner.id,
          itemKey: "p_nope",
          share: code,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      (await reserve(owner, { ownerId: owner.id, itemKey: key })).statusCode,
    ).toBe(403);
  });

  it("снять можно только свою бронь", async () => {
    const { owner, productIds } = await readyOwner();
    const { code } = await share(owner);
    const author = await server.newUser({ name: "Автор" });
    const other = await server.newUser({ name: "Другой" });
    const made = (
      await reserve(author, {
        ownerId: owner.id,
        itemKey: productIds[0] ?? "",
        share: code,
      })
    ).json() as { id: string };
    expect(
      (await server.request(other, "DELETE", `/reservations/${made.id}`))
        .statusCode,
    ).toBe(403);
    expect(
      (await server.request(author, "DELETE", `/reservations/${made.id}`))
        .statusCode,
    ).toBe(200);
    expect(
      (await server.request(author, "DELETE", `/reservations/${made.id}`))
        .statusCode,
    ).toBe(404);
  });
});

describe("приглашения в план и игру (POST /share-links)", () => {
  it("участнику — короткая ссылка, повтор — та же; не участнику — 404; GET /share/:code — id плана", async () => {
    const owner = await server.newUser({ name: "Айгерим" });
    const stranger = await server.newUser({ name: "Чужой" });
    await database.db.insert(plans).values({
      id: "pl_1",
      title: "Пятница",
      ownerId: owner.id,
      mode: "live",
      status: "lobby",
      filters: {},
      deck: [],
    });
    await database.db
      .insert(planParticipants)
      .values({ planId: "pl_1", userId: owner.id, joinedAt: new Date(NOW) });
    const body = { kind: "plan", targetId: "pl_1" };
    expect(
      (await server.request(stranger, "POST", "/share-links", body)).statusCode,
    ).toBe(404);
    const first = (
      await server.request(owner, "POST", "/share-links", body)
    ).json() as Share;
    expect(first.code).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(
      (await server.request(owner, "POST", "/share-links", body)).json(),
    ).toEqual(first);
    expect(
      (await server.request(stranger, "GET", `/share/${first.code}`)).json(),
    ).toEqual({ kind: "plan", planId: "pl_1" });
  });
});

describe("ревью сервера: дружба по ссылке", () => {
  it("R1 + Q07: безымянный открыл ссылку и забронировал с именем — «новый друг» не появляется ни сразу, ни при перечитывании; через сутки — друг", async () => {
    // Свой сервер с часами, которые тест двигает.
    const clock = makeClock();
    server = await createTestServer(database, clock);
    const { owner, productIds } = await readyOwner();
    const { code } = await share(owner);
    const friendsOf = async () =>
      (
        (await server.request(owner, "GET", "/friends")).json() as Array<{
          user: { id: string };
        }>
      ).map((entry) => entry.user.id);

    const nameless = await server.newUser();
    await server.request(nameless, "GET", `/share/${code}`);
    const before = await friendsOf();
    const made = await reserve(nameless, {
      ownerId: owner.id,
      itemKey: productIds[0] ?? "",
      name: "Айгерим",
      share: code,
    });
    expect(made.statusCode).toBe(200);
    expect(await friendsOf()).toEqual(before);
    // Экран гостя перечитывает ссылку раз в 30 с — дружбы нет (Q07).
    clock.advance(30_000);
    await server.request(nameless, "GET", `/share/${code}`);
    expect(await friendsOf()).toEqual(before);
    // Через сутки после брони — новое открытие ставит дружбу.
    clock.advance(25 * 3600_000);
    await server.request(nameless, "GET", `/share/${code}`);
    expect(await friendsOf()).toEqual([nameless.id]);
  });

  it("Q07: фоновое перечитывание (x-swipeit-refetch: 1) дружбу не ставит; посетитель с именем без брони — друг сразу", async () => {
    const { owner } = await readyOwner();
    const { code } = await share(owner);
    const friendsOf = async () =>
      (
        (await server.request(owner, "GET", "/friends")).json() as Array<{
          user: { id: string };
        }>
      ).map((entry) => entry.user.id);

    const visitor = await server.newUser({ name: "Бакыт" });
    const refetch = await server.app.inject({
      method: "GET",
      url: `/v1/share/${code}`,
      headers: {
        authorization: `Bearer ${visitor.token}`,
        "x-swipeit-refetch": "1",
      },
    });
    expect(refetch.statusCode).toBe(200);
    expect(await friendsOf()).toEqual([]);

    await server.request(visitor, "GET", `/share/${code}`);
    expect(await friendsOf()).toEqual([visitor.id]);
  });

  it("R3: двое одновременно открывают вишлисты друг друга — без deadlock, все 200", async () => {
    const pairs: Array<[TestUser, string, TestUser, string]> = [];
    for (let index = 0; index < 10; index += 1) {
      const a = (await readyOwner(`А${index}`)).owner;
      const b = (await readyOwner(`Б${index}`)).owner;
      pairs.push([a, (await share(a)).code, b, (await share(b)).code]);
    }
    const answers = await Promise.all(
      pairs.flatMap(([a, codeA, b, codeB]) => [
        server.request(a, "GET", `/share/${codeB}`),
        server.request(b, "GET", `/share/${codeA}`),
      ]),
    );
    expect(answers.map((answer) => answer.statusCode)).toEqual(
      answers.map(() => 200),
    );
  }, 60_000);
});
