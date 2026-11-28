import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { decodeWishlist, encodeWishlist } from "@/shared/lib/share-codec";

import type { User } from "../users/types";
import type {
  ExternalWishlist,
  GuestWishlist,
  Reservation,
  ReservationsView,
  WishlistItem,
  WishlistMeta,
  WishlistResponse,
} from "../wishlist/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
  createRecordingRealtime,
} from "./adapters/memory";
import { parseProducts } from "./catalog-parse";
import { createSeededRandom } from "./random";
import { DEMO_USER_ID, createSeedDb } from "./seed";
import { type MockServer, createMockServer } from "./server";

// Гостевые маршруты мок-сервера: повод, ссылка, импорт снимка, чужой
// вишлист, брони и подсказка «Возможно, тебе подарили это».
const stubPath = fileURLToPath(
  new URL("../../../../catalog-stub/products.json", import.meta.url),
);
const { items: products } = parseProducts(
  JSON.parse(readFileSync(stubPath, "utf8")),
);

// 26.11.2026 12:00 — фиксированные часы демо.
const NOW = new Date(2026, 10, 26, 12).getTime();
const GIVEN_AT = "2026-11-25T10:00:00.000Z";
const BOT_ID = "u_azamat";

let server: MockServer;
let db: ReturnType<typeof createMemoryDb>;
let clock: ReturnType<typeof createFixedClock>;

const call = <T>(
  method: "DELETE" | "GET" | "PATCH" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
  query?: Record<string, unknown>,
) => server.handle({ method, path, userId, body, query }) as Promise<T>;

const newUser = () =>
  call<User>("POST", "/users", null, {
    name: "Тест",
    avatarColor: "mint",
    interests: ["gadgets", "music", "coffee"],
    audience: "all",
  });

const demo = async () => {
  const user = await call<User>("POST", "/auth/demo", null);
  expect(user.id).toBe(DEMO_USER_ID);
  return user.id;
};

const wishlist = (userId: string) =>
  call<WishlistResponse>("GET", "/wishlist", userId);

const updateMeta = (userId: string, body: unknown) =>
  call<WishlistMeta>("PATCH", "/wishlist/meta", userId, body);

const share = (userId: null | string) =>
  call<{ url: string }>("POST", "/wishlist/share", userId);

const markGiven = (userId: string, itemId: string) =>
  call<WishlistItem>("POST", `/wishlist/items/${itemId}/given`, userId, {
    at: GIVEN_AT,
  });

const importCode = (encoded: string, userId: null | string = null) =>
  call<ExternalWishlist>("POST", "/external-wishlists", userId, { encoded });

const reserve = (
  userId: null | string,
  body: { guestId?: string; itemKey: string; name?: string; ownerId: string },
) =>
  call<Reservation>("POST", "/reservations", userId, {
    name: "Гость",
    ...body,
  });

const reservations = (
  userId: null | string,
  ownerId: string,
  guestId?: string,
) =>
  call<ReservationsView>("GET", "/reservations", userId, undefined, {
    ownerId,
    guestId,
  });

const unreserve = (id: string, guestId?: string) =>
  call<{ ok: true }>("DELETE", `/reservations/${id}`, null, undefined, {
    guestId,
  });

const keyOf = (item: WishlistItem) =>
  item.source.kind === "product"
    ? item.source.productId
    : `custom:${item.source.custom.title}`;

const dParam = (url: string) =>
  new URLSearchParams(url.slice(url.indexOf("?"))).get("d");

// Первое желание демо-вишлиста — товар, бронируем его.
const firstProduct = async (userId: string) => {
  const [item] = (await wishlist(userId)).items;
  if (item?.source.kind !== "product") throw new Error("нужен товар");
  return item;
};

beforeEach(() => {
  const catalog = createMemoryCatalog(products);
  clock = createFixedClock(NOW);
  db = createMemoryDb(async () => createSeedDb({ products, now: clock.now() }));
  server = createMockServer({
    catalog,
    clock,
    db,
    realtime: createRecordingRealtime(),
    random: createSeededRandom("test"),
    settings: createMemorySettings(),
  });
});

describe("ссылка на вишлист", () => {
  it("демо-пользователь получает /w/?d=, в снимке — имя и только активные", async () => {
    const userId = await demo();
    const { items } = await wishlist(userId);
    const given = items[1];
    if (!given) throw new Error("нет желаний в демо");
    await markGiven(userId, given.id);

    const { url } = await share(userId);
    expect(url.startsWith("/w/?d=")).toBe(true);
    const shared = decodeWishlist(dParam(url));
    expect(shared).not.toBeNull();
    expect(shared?.owner).toMatchObject({ name: "Айгерим", userId });
    expect(shared?.occasion).toMatchObject({
      kind: "new_year",
      date: "2026-12-31",
    });
    expect(shared?.items).toHaveLength(items.length - 1);
    const sharedIds = shared?.items.map((item) => item.productId);
    expect(sharedIds).not.toContain(keyOf(given));
    expect(new Set(sharedIds)).toEqual(
      new Set(items.filter((item) => item !== given).map(keyOf)),
    );
  });

  it("«Очень хочу» идут первыми", async () => {
    const userId = await demo();
    const shared = decodeWishlist(dParam((await share(userId)).url));
    const priorities = shared?.items.map((item) => item.priority) ?? [];
    const firstNormal = priorities.indexOf("normal");
    expect(priorities.slice(firstNormal)).not.toContain("top");
  });

  it("новый пользователь без 5 «Хочу» — FORBIDDEN", async () => {
    const user = await newUser();
    await expect(share(user.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("без входа — FORBIDDEN", async () => {
    await expect(share(null)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("повод и сообщение", () => {
  it("повод ставится и снимается через null", async () => {
    const userId = await demo();
    const set = await updateMeta(userId, {
      occasion: { kind: "custom", label: "Выпускной", date: "2027-06-20" },
    });
    expect(set.occasion).toEqual({
      kind: "custom",
      label: "Выпускной",
      date: "2027-06-20",
    });
    expect((await wishlist(userId)).meta.occasion?.label).toBe("Выпускной");

    const cleared = await updateMeta(userId, { occasion: null });
    expect(cleared.occasion).toBeUndefined();
    expect((await wishlist(userId)).meta.occasion).toBeUndefined();
  });

  it("без поля occasion повод не трогается", async () => {
    const userId = await demo();
    const meta = await updateMeta(userId, { message: "Привет" });
    expect(meta.occasion).toMatchObject({ kind: "new_year" });
  });

  it("сообщение обрезается, пустое убирается", async () => {
    const userId = await demo();
    expect((await updateMeta(userId, { message: "  Жду!  " })).message).toBe(
      "Жду!",
    );
    expect((await wishlist(userId)).meta.message).toBe("Жду!");
    expect(
      (await updateMeta(userId, { message: "   " })).message,
    ).toBeUndefined();
  });

  it("сообщение длиннее 200 символов — VALIDATION", async () => {
    const userId = await demo();
    await expect(
      updateMeta(userId, { message: "я".repeat(201) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const ok = await updateMeta(userId, { message: "я".repeat(200) });
    expect(ok.message).toHaveLength(200);
  });

  it("hideReservationCount — reservationCount становится null", async () => {
    const userId = await demo();
    expect((await wishlist(userId)).reservationCount).toBe(0);
    await updateMeta(userId, { hideReservationCount: true });
    expect((await wishlist(userId)).reservationCount).toBeNull();
    await updateMeta(userId, { hideReservationCount: false });
    expect((await wishlist(userId)).reservationCount).toBe(0);
  });

  it("у нового пользователя meta создаётся", async () => {
    const user = await newUser();
    const meta = await updateMeta(user.id, { message: "Первое" });
    expect(meta).toMatchObject({
      ownerId: user.id,
      hideReservationCount: false,
      message: "Первое",
    });
  });
});

describe("импорт снимка по ссылке", () => {
  const encoded = encodeWishlist({
    owner: { name: "Бакыт", avatarColor: "mint", userId: "u_bakyt" },
    occasion: { kind: "birthday", date: "2026-12-10" },
    message: "Спасибо!",
    items: [
      { productId: "p_1", priority: "top", note: "Чёрный" },
      { custom: { title: "Плед", priceMin: 1000 }, priority: "normal" },
    ],
  });

  it("возвращает ew_…, владельца и желания с ключами", async () => {
    const external = await importCode(encoded);
    expect(external.id).toMatch(/^ew_/);
    expect(external.owner).toMatchObject({
      name: "Бакыт",
      avatarColor: "mint",
      userId: "u_bakyt",
    });
    expect(external.meta).toMatchObject({
      occasion: { kind: "birthday", date: "2026-12-10" },
      message: "Спасибо!",
    });
    expect(external.items).toMatchObject([
      { key: "p_1", productId: "p_1", priority: "top", note: "Чёрный" },
      {
        key: "custom:Плед",
        custom: { title: "Плед", priceMin: 1000 },
        priority: "normal",
      },
    ]);
    expect(external.openedAt).toBe(new Date(NOW).toISOString());
    expect((await db.read()).externalWishlists[external.id]).toEqual(external);
  });

  it("тот же код — тот же id", async () => {
    const first = await importCode(encoded);
    clock.advance(60_000);
    const second = await importCode(encoded);
    expect(second.id).toBe(first.id);
    expect(Object.keys((await db.read()).externalWishlists)).toHaveLength(1);
  });

  it("другой код — другой id", async () => {
    const other = encodeWishlist({
      owner: { name: "Бакыт", avatarColor: "mint" },
      items: [{ productId: "p_2", priority: "normal" }],
    });
    expect((await importCode(other)).id).not.toBe(
      (await importCode(encoded)).id,
    );
  });

  it("битый код — VALIDATION", async () => {
    await expect(importCode("abc")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(importCode(encoded.slice(0, 20))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(importCode("")).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("работает и у вошедшего пользователя", async () => {
    const user = await newUser();
    expect((await importCode(encoded, user.id)).id).toMatch(/^ew_/);
  });

  it("ссылка из /wishlist/share импортируется обратно", async () => {
    const userId = await demo();
    const code = dParam((await share(userId)).url) ?? "";
    const external = await importCode(code);
    const { items } = await wishlist(userId);
    expect(external.owner.name).toBe("Айгерим");
    expect(new Set(external.items.map((item) => item.key))).toEqual(
      new Set(items.map(keyOf)),
    );
  });
});

describe("чужой вишлист", () => {
  it("только активные желания, с ключами", async () => {
    await db.write((draft) => {
      const target = draft.wishlistItems[BOT_ID]?.[0];
      if (!target) throw new Error("нет желаний у бота");
      target.status = "given";
      target.given = { at: GIVEN_AT };
    });
    const all = (await db.read()).wishlistItems[BOT_ID] ?? [];
    const view = await call<GuestWishlist>(
      "GET",
      `/users/${BOT_ID}/wishlist`,
      null,
    );
    expect(view.owner).toMatchObject({ name: "Азамат", userId: BOT_ID });
    const active = all.filter((item) => item.status === "active");
    expect(view.items).toHaveLength(active.length);
    expect(view.items.map((item) => item.key)).not.toContain(keyOf(all[0]!));
    expect(new Set(view.items.map((item) => item.key))).toEqual(
      new Set(active.map(keyOf)),
    );
    view.items.forEach((item) => expect(item.key).toBe(item.productId));
  });

  it("неизвестный id — NOT_FOUND", async () => {
    await expect(
      call("GET", "/users/u_nobody/wishlist", null),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("брони", () => {
  it("гость бронирует, второй гость — CONFLICT, повтор — та же бронь", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    const itemKey = keyOf(item);

    const created = await reserve(null, {
      ownerId,
      itemKey,
      guestId: "g_1",
      name: "  Бакыт  ",
    });
    expect(created).toMatchObject({
      ownerId,
      itemKey,
      reserver: { userId: "g_1", name: "Бакыт" },
      at: new Date(NOW).toISOString(),
    });
    expect(created.id).toMatch(/^rs_/);
    expect(created.closedAt).toBeUndefined();

    await expect(
      reserve(null, { ownerId, itemKey, guestId: "g_2" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const again = await reserve(null, { ownerId, itemKey, guestId: "g_1" });
    expect(again).toEqual(created);
    expect((await db.read()).reservations).toHaveLength(1);
  });

  it("владелец видит только количество, гость — свои и чужие брони", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    const created = await reserve(null, {
      ownerId,
      itemKey: keyOf(item),
      guestId: "g_1",
    });

    expect(await reservations(ownerId, ownerId)).toEqual({
      role: "owner",
      count: 1,
    });
    expect((await wishlist(ownerId)).reservationCount).toBe(1);

    const forG1 = [
      { id: created.id, itemKey: keyOf(item), mine: true, closed: false },
    ];
    expect(await reservations(null, ownerId, "g_1")).toEqual({
      role: "guest",
      items: forG1,
    });
    expect(await reservations(null, ownerId, "g_2")).toEqual({
      role: "guest",
      items: [{ ...forG1[0], mine: false }],
    });
    // Гость без id — ничего не «его».
    const anonymous = await reservations(null, ownerId);
    expect(anonymous.role === "guest" && anonymous.items[0]?.mine).toBe(false);
  });

  it("вошедший друг бронирует под своим id", async () => {
    const ownerId = await demo();
    const friend = await newUser();
    const item = await firstProduct(ownerId);
    const created = await reserve(friend.id, {
      ownerId,
      itemKey: keyOf(item),
    });
    expect(created.reserver.userId).toBe(friend.id);
    const view = await reservations(friend.id, ownerId);
    expect(view.role === "guest" && view.items[0]?.mine).toBe(true);
  });

  it("брони других владельцев гостю не видны", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    await reserve(null, { ownerId, itemKey: keyOf(item), guestId: "g_1" });
    expect(await reservations(null, BOT_ID, "g_1")).toEqual({
      role: "guest",
      items: [],
    });
  });

  it("владелец бронирует своё — FORBIDDEN", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    await expect(
      reserve(ownerId, { ownerId, itemKey: keyOf(item) }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await db.read()).reservations).toHaveLength(0);
  });

  it("без имени — VALIDATION, без гостя и входа — VALIDATION", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    await expect(
      reserve(null, {
        ownerId,
        itemKey: keyOf(item),
        guestId: "g_1",
        name: " ",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      reserve(null, { ownerId, itemKey: keyOf(item) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("снять бронь может только тот, кто бронировал", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    const created = await reserve(null, {
      ownerId,
      itemKey: keyOf(item),
      guestId: "g_1",
    });

    await expect(unreserve(created.id, "g_2")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(unreserve(created.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    expect((await wishlist(ownerId)).reservationCount).toBe(1);

    expect(await unreserve(created.id, "g_1")).toEqual({ ok: true });
    expect((await wishlist(ownerId)).reservationCount).toBe(0);
    expect(await reservations(ownerId, ownerId)).toEqual({
      role: "owner",
      count: 0,
    });
    // После снятия желание свободно для других.
    expect(
      (await reserve(null, { ownerId, itemKey: keyOf(item), guestId: "g_2" }))
        .reserver.userId,
    ).toBe("g_2");
  });

  it("DELETE неизвестной брони — NOT_FOUND", async () => {
    await expect(unreserve("rs_nope", "g_1")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("«подарили» закрывает бронь", () => {
  it("гость видит closed, владелец её не считает", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    const created = await reserve(null, {
      ownerId,
      itemKey: keyOf(item),
      guestId: "g_1",
    });
    await markGiven(ownerId, item.id);

    expect(await reservations(null, ownerId, "g_1")).toEqual({
      role: "guest",
      items: [
        { id: created.id, itemKey: keyOf(item), mine: true, closed: true },
      ],
    });
    expect(await reservations(ownerId, ownerId)).toEqual({
      role: "owner",
      count: 0,
    });
    expect((await wishlist(ownerId)).reservationCount).toBe(0);
  });

  it("закрытая бронь не мешает новой", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    await reserve(null, { ownerId, itemKey: keyOf(item), guestId: "g_1" });
    await markGiven(ownerId, item.id);
    await call("POST", `/wishlist/items/${item.id}/restore`, ownerId);
    const second = await reserve(null, {
      ownerId,
      itemKey: keyOf(item),
      guestId: "g_2",
    });
    expect(second.reserver.userId).toBe("g_2");
    expect((await wishlist(ownerId)).reservationCount).toBe(1);
  });
});

describe("подсказка «Возможно, тебе подарили это»", () => {
  const setDate = (userId: string, date: string) =>
    updateMeta(userId, { occasion: { kind: "birthday", date } });

  it("после даты повода — id забронированного желания", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    await reserve(null, { ownerId, itemKey: keyOf(item), guestId: "g_1" });

    // Повод (31.12) ещё не прошёл — подсказки нет.
    expect((await wishlist(ownerId)).givenHintIds).toEqual([]);

    await setDate(ownerId, "2026-11-20");
    expect((await wishlist(ownerId)).givenHintIds).toEqual([item.id]);
  });

  it("сегодняшняя и будущая дата — пусто", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    await reserve(null, { ownerId, itemKey: keyOf(item), guestId: "g_1" });
    await setDate(ownerId, "2026-11-26");
    expect((await wishlist(ownerId)).givenHintIds).toEqual([]);
    await setDate(ownerId, "2026-12-01");
    expect((await wishlist(ownerId)).givenHintIds).toEqual([]);
  });

  it("без брони — пусто", async () => {
    const ownerId = await demo();
    await setDate(ownerId, "2026-11-20");
    expect((await wishlist(ownerId)).givenHintIds).toEqual([]);
  });

  it("«Скрыть» убирает для этой даты, новая прошедшая дата — снова видно", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    await reserve(null, { ownerId, itemKey: keyOf(item), guestId: "g_1" });
    await setDate(ownerId, "2026-11-20");

    expect(await call("POST", "/wishlist/given-hint/dismiss", ownerId)).toEqual(
      { ok: true },
    );
    expect((await wishlist(ownerId)).givenHintIds).toEqual([]);
    expect((await wishlist(ownerId)).meta.dismissedGivenHintFor).toBe(
      "2026-11-20",
    );

    await setDate(ownerId, "2026-11-22");
    expect((await wishlist(ownerId)).givenHintIds).toEqual([item.id]);
  });

  it("подаренное желание в подсказку не попадает", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    await reserve(null, { ownerId, itemKey: keyOf(item), guestId: "g_1" });
    await setDate(ownerId, "2026-11-20");
    await markGiven(ownerId, item.id);
    expect((await wishlist(ownerId)).givenHintIds).toEqual([]);
  });

  it("часы перешли дату повода — подсказка появляется", async () => {
    const ownerId = await demo();
    const item = await firstProduct(ownerId);
    await reserve(null, { ownerId, itemKey: keyOf(item), guestId: "g_1" });
    await setDate(ownerId, "2026-11-27");
    expect((await wishlist(ownerId)).givenHintIds).toEqual([]);
    clock.advance(2 * 24 * 60 * 60_000);
    expect((await wishlist(ownerId)).givenHintIds).toEqual([item.id]);
  });
});

describe("ревью этапа 2", () => {
  const addCustom = (userId: string, body: Record<string, unknown>) =>
    call<WishlistItem>("POST", "/wishlist/items", userId, body);

  it("два своих желания с одним названием — разные ключи броней", async () => {
    const owner = await newUser();
    const first = await addCustom(owner.id, { title: "Книга" });
    const second = await addCustom(owner.id, { title: "Книга" });
    const view = await call<GuestWishlist>(
      "GET",
      `/users/${owner.id}/wishlist`,
      null,
    );
    const keys = view.items.map((item) => item.key);
    // Новые желания — первыми: второе выше первого.
    expect(keys).toEqual([`custom:${second.id}`, `custom:${first.id}`]);
    await reserve(null, {
      ownerId: owner.id,
      itemKey: keys[0] ?? "",
      guestId: "g_1",
    });
    const forOther = await reservations(null, owner.id, "g_2");
    if (forOther.role !== "guest") throw new Error("нужен гостевой вид");
    expect(forOther.items.map((item) => item.itemKey)).toEqual([keys[0]]);
  });

  it("ссылка: ключ своего желания едет в снимке, длинная и не-http ссылка отбрасывается", async () => {
    const owner = await newUser();
    const item = await addCustom(owner.id, {
      title: "Плед",
      url: "https://shop.kg/pled",
    });
    await expect(
      addCustom(owner.id, {
        title: "Длинная",
        url: `https://a.kg/${"x".repeat(500)}`,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const encoded = encodeWishlist({
      owner: { name: "А", avatarColor: "mint" },
      items: [
        {
          key: `custom:${item.id}`,
          priority: "normal",
          custom: { title: "Плед", url: "javascript:alert(1)" },
        },
        {
          priority: "normal",
          custom: { title: "Шарф", url: `https://a.kg/${"x".repeat(600)}` },
        },
      ],
    });
    const decoded = decodeWishlist(encoded);
    expect(decoded?.items[0]?.key).toBe(`custom:${item.id}`);
    expect(decoded?.items[0]?.custom?.url).toBeUndefined();
    expect(decoded?.items[1]?.custom?.url).toBeUndefined();
  });

  it("желание вернули из «Подарили» — закрытая бронь не держит «Уже подарено»", async () => {
    const userId = await demo();
    const [target] = (await wishlist(userId)).items;
    if (!target || target.source.kind !== "product")
      throw new Error("нужен товар");
    const key = target.source.productId;
    await reserve(BOT_ID, { ownerId: userId, itemKey: key });
    await markGiven(userId, target.id);
    const closed = await reservations(BOT_ID, userId);
    if (closed.role !== "guest") throw new Error("нужен гостевой вид");
    expect(closed.items.find((item) => item.itemKey === key)?.closed).toBe(
      true,
    );
    await call("POST", `/wishlist/items/${target.id}/restore`, userId, {});
    const reopened = await reservations(BOT_ID, userId);
    if (reopened.role !== "guest") throw new Error("нужен гостевой вид");
    expect(reopened.items.some((item) => item.itemKey === key)).toBe(false);
    // Желание снова свободно — бронировать можно заново.
    await reserve(BOT_ID, { ownerId: userId, itemKey: key });
  });

  it("товар, лайкнутый заново при копии в «Подарили», у гостя — один раз", async () => {
    const userId = await demo();
    const [target] = (await wishlist(userId)).items;
    if (!target || target.source.kind !== "product")
      throw new Error("нужен товар");
    await markGiven(userId, target.id);
    await call("POST", "/swipes", userId, {
      productId: target.source.productId,
      decision: "like",
      context: { kind: "self" },
    });
    await call("POST", `/wishlist/items/${target.id}/restore`, userId, {});
    const view = await call<GuestWishlist>(
      "GET",
      `/users/${userId}/wishlist`,
      null,
    );
    const keys = view.items.map((item) => item.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("бронь гостя переходит в профиль (auto-tasks U02)", () => {
  it("гость бронирует, потом создаёт профиль с guestId — бронь его, снять можно", async () => {
    const owner = await demo();
    const itemKey = (await wishlist(owner)).items[0]?.source;
    const key = itemKey?.kind === "product" ? itemKey.productId : "custom:нет";
    const guestId = "g_beforeprofile";
    const made = await call<Reservation>("POST", "/reservations", null, {
      ownerId: owner,
      itemKey: key,
      name: "Бакыт",
      guestId,
    });

    const profile = await call<User>("POST", "/users", null, {
      name: "Бакыт",
      guestId,
    });
    const view = await call<ReservationsView>(
      "GET",
      "/reservations",
      profile.id,
      undefined,
      { ownerId: owner },
    );
    expect(view.role === "guest" && view.items).toEqual([
      expect.objectContaining({ id: made.id, mine: true, closed: false }),
    ]);
    await call("DELETE", `/reservations/${made.id}`, profile.id);
    const after = await call<ReservationsView>(
      "GET",
      "/reservations",
      profile.id,
      undefined,
      { ownerId: owner },
    );
    expect(after.role === "guest" && after.items).toEqual([]);
  });

  it("чужие брони гостя не трогает: другой guestId", async () => {
    const owner = await demo();
    const source = (await wishlist(owner)).items[0]?.source;
    const key = source?.kind === "product" ? source.productId : "custom:нет";
    await call("POST", "/reservations", null, {
      ownerId: owner,
      itemKey: key,
      name: "Другой",
      guestId: "g_someone",
    });
    const profile = await call<User>("POST", "/users", null, {
      guestId: "g_me",
    });
    const view = await call<ReservationsView>(
      "GET",
      "/reservations",
      profile.id,
      undefined,
      { ownerId: owner },
    );
    expect(view.role === "guest" && view.items).toEqual([
      expect.objectContaining({ mine: false }),
    ]);
  });
});
