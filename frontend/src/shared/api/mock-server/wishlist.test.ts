import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { User } from "../users/types";
import type {
  Reservation,
  WishlistItem,
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

// Маршруты вишлиста мок-сервера в окружении node, с базой в памяти.
// Каталог — заглушка catalog-stub (24 товара).
const stubPath = fileURLToPath(
  new URL("../../../../catalog-stub/products.json", import.meta.url),
);
const { items: products } = parseProducts(
  JSON.parse(readFileSync(stubPath, "utf8")),
);

// 26.11.2026 12:00 — фиксированные часы демо.
const NOW = new Date(2026, 10, 26, 12).getTime();
const NOW_ISO = new Date(NOW).toISOString();
const GIVEN_AT = "2026-11-25T10:00:00.000Z";

let server: MockServer;
let db: ReturnType<typeof createMemoryDb>;
let clock: ReturnType<typeof createFixedClock>;
let realtime: ReturnType<typeof createRecordingRealtime>;

const call = <T>(
  method: "DELETE" | "GET" | "PATCH" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
) => server.handle({ method, path, userId, body }) as Promise<T>;

const newUser = (overrides: Partial<User> = {}) =>
  call<User>("POST", "/users", null, {
    name: "Тест",
    avatarColor: "mint",
    interests: ["gadgets", "music", "coffee"],
    audience: "all",
    ...overrides,
  });

// Демо-вход: Айгерим с вишлистом из 8 товаров (order 0..7).
const demo = async () => {
  const user = await call<User>("POST", "/auth/demo", null);
  expect(user.id).toBe(DEMO_USER_ID);
  return user.id;
};

const wishlist = (userId: string) =>
  call<WishlistResponse>("GET", "/wishlist", userId);

const sortedIds = async (userId: string) =>
  (await wishlist(userId)).items.map((item) => item.id);

const findIn = async (userId: string, itemId: string) =>
  (await wishlist(userId)).items.find((item) => item.id === itemId);

const maxOrder = (items: WishlistItem[]) =>
  Math.max(...items.map((item) => item.order));

const addCustom = (userId: string, body: Record<string, unknown>) =>
  call<WishlistItem>("POST", "/wishlist/items", userId, body);

const patch = (userId: string, itemId: string, body: unknown) =>
  call<WishlistItem>("PATCH", `/wishlist/items/${itemId}`, userId, body);

const markGiven = (userId: string, itemId: string, body: unknown) =>
  call<WishlistItem>("POST", `/wishlist/items/${itemId}/given`, userId, body);

const restore = (userId: string, itemId: string, body?: unknown) =>
  call<WishlistItem>("POST", `/wishlist/items/${itemId}/restore`, userId, body);

// Открытая бронь прямо в базе — маршрута брони у владельца нет.
const reserve = (ownerId: string, itemKey: string, id = "rs_test") =>
  db.write((draft) => {
    const reservation: Reservation = {
      id,
      ownerId,
      itemKey,
      reserver: { name: "Гость" },
      at: new Date(NOW - 60 * 60_000).toISOString(),
    };
    draft.reservations.push(reservation);
  });

const reservation = async (id = "rs_test") =>
  (await db.read()).reservations.find((entry) => entry.id === id);

const lastScope = () => {
  const event = realtime.events.at(-1);
  expect(event).toMatchObject({ type: "db:changed" });
  return event && "scope" in event ? event.scope : [];
};

beforeEach(() => {
  const catalog = createMemoryCatalog(products);
  clock = createFixedClock(NOW);
  realtime = createRecordingRealtime();
  db = createMemoryDb(async () => createSeedDb({ products, now: clock.now() }));
  server = createMockServer({
    catalog,
    clock,
    db,
    realtime,
    random: createSeededRandom("test"),
    settings: createMemorySettings(),
  });
});

describe("своё желание", () => {
  it("встаёт в конец: order = max+1, активное, обычный приоритет", async () => {
    const userId = await demo();
    const before = await wishlist(userId);
    expect(before.items.length).toBeGreaterThanOrEqual(8);
    const created = await addCustom(userId, {
      title: "  Плед с оленями  ",
      priceMin: 1500,
      priceMax: 3000,
    });
    expect(created).toMatchObject({
      ownerId: userId,
      source: {
        kind: "custom",
        custom: { title: "Плед с оленями", priceMin: 1500, priceMax: 3000 },
      },
      order: maxOrder(before.items) + 1,
      status: "active",
      priority: "normal",
      addedAt: NOW_ISO,
    });
    expect(created.id).toMatch(/^wi_/);
    expect((await sortedIds(userId)).at(-1)).toBe(created.id);
  });

  it("в пустом вишлисте — order 0", async () => {
    const user = await newUser();
    const created = await addCustom(user.id, { title: "Книга" });
    expect(created.order).toBe(0);
  });

  it("пустое название — VALIDATION", async () => {
    const user = await newUser();
    await expect(addCustom(user.id, { title: "   " })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(addCustom(user.id, {})).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect((await wishlist(user.id)).items).toHaveLength(0);
  });

  it("цена «от» больше «до» — VALIDATION", async () => {
    const user = await newUser();
    await expect(
      addCustom(user.id, { title: "Наушники", priceMin: 5000, priceMax: 1000 }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await wishlist(user.id)).items).toHaveLength(0);
  });
});

describe("изменение желания", () => {
  it("приоритет top и обратно normal", async () => {
    const user = await newUser();
    const item = await addCustom(user.id, { title: "Книга" });
    expect((await patch(user.id, item.id, { priority: "top" })).priority).toBe(
      "top",
    );
    expect((await findIn(user.id, item.id))?.priority).toBe("top");
    await patch(user.id, item.id, { priority: "normal" });
    expect((await findIn(user.id, item.id))?.priority).toBe("normal");
  });

  it("вариант и заметка сохраняются", async () => {
    const user = await newUser();
    const item = await addCustom(user.id, { title: "Худи" });
    await patch(user.id, item.id, {
      variantChoice: { color: "серый", size: "L" },
      note: "  Лучше оверсайз  ",
    });
    expect(await findIn(user.id, item.id)).toMatchObject({
      variantChoice: { color: "серый", size: "L" },
      note: "Лучше оверсайз",
    });
  });

  it("пустая заметка убирает её", async () => {
    const user = await newUser();
    const item = await addCustom(user.id, { title: "Худи" });
    await patch(user.id, item.id, { note: "Синее" });
    const cleared = await patch(user.id, item.id, { note: "" });
    expect(cleared.note).toBeUndefined();
    expect((await findIn(user.id, item.id))?.note).toBeUndefined();
  });

  it("заметка длиннее 140 символов — VALIDATION", async () => {
    const user = await newUser();
    const item = await addCustom(user.id, { title: "Худи" });
    await expect(
      patch(user.id, item.id, { note: "я".repeat(141) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const ok = await patch(user.id, item.id, { note: "я".repeat(140) });
    expect(ok.note).toHaveLength(140);
  });

  it("неизвестный id — NOT_FOUND", async () => {
    const user = await newUser();
    await expect(
      patch(user.id, "wi_nope", { priority: "top" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("чужое желание — NOT_FOUND и не меняется", async () => {
    const ownerId = await demo();
    const stranger = await newUser();
    const [target] = (await wishlist(ownerId)).items;
    if (!target) throw new Error("нет желаний в демо");
    await expect(
      patch(stranger.id, target.id, { note: "чужое" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await findIn(ownerId, target.id))?.note).toBe(target.note);
  });
});

describe("удаление и отмена удаления", () => {
  it("DELETE возвращает удалённое желание, undelete кладёт на то же место", async () => {
    const userId = await demo();
    const before = await wishlist(userId);
    const target = before.items[3];
    if (!target) throw new Error("нет желаний в демо");

    const removed = await call<WishlistItem>(
      "DELETE",
      `/wishlist/items/${target.id}`,
      userId,
    );
    expect(removed).toEqual(target);
    expect(await sortedIds(userId)).not.toContain(target.id);

    await call(
      "POST",
      `/wishlist/items/${removed.id}/undelete`,
      userId,
      removed,
    );
    const after = await wishlist(userId);
    expect(after.items.map((item) => item.id)).toEqual(
      before.items.map((item) => item.id),
    );
    expect(after.items.find((item) => item.id === target.id)).toEqual(target);
  });

  it("DELETE неизвестного id — NOT_FOUND", async () => {
    const user = await newUser();
    await expect(
      call("DELETE", "/wishlist/items/wi_nope", user.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("undelete с другим id в пути — VALIDATION", async () => {
    const user = await newUser();
    const item = await addCustom(user.id, { title: "Книга" });
    const removed = await call<WishlistItem>(
      "DELETE",
      `/wishlist/items/${item.id}`,
      user.id,
    );
    await expect(
      call("POST", "/wishlist/items/wi_other/undelete", user.id, removed),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await wishlist(user.id)).items).toHaveLength(0);
  });

  it("undelete чужого желания — FORBIDDEN", async () => {
    const ownerId = await demo();
    const stranger = await newUser();
    const [target] = (await wishlist(ownerId)).items;
    if (!target) throw new Error("нет желаний в демо");
    await expect(
      call(
        "POST",
        `/wishlist/items/${target.id}/undelete`,
        stranger.id,
        target,
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await wishlist(stranger.id)).items).toHaveLength(0);
  });
});

describe("ручной порядок", () => {
  it("обратный порядок ids — GET отдаёт в этом порядке", async () => {
    const userId = await demo();
    const reversed = (await sortedIds(userId)).reverse();
    await call("POST", "/wishlist/reorder", userId, { ids: reversed });
    const { items } = await wishlist(userId);
    expect(items.map((item) => item.id)).toEqual(reversed);
    expect(items.map((item) => item.order)).toEqual(items.map((_, i) => i));
  });

  it("не упомянутые встают в конец, сохраняя взаимный порядок", async () => {
    const userId = await demo();
    const all = await sortedIds(userId);
    const picked = [all[5], all[2]] as string[];
    await call("POST", "/wishlist/reorder", userId, { ids: picked });
    const rest = all.filter((itemId) => !picked.includes(itemId));
    expect(await sortedIds(userId)).toEqual([...picked, ...rest]);
  });
});

describe("«Мне это подарили»", () => {
  it("статус given, от кого и когда сохранены, бронь товара закрыта", async () => {
    const userId = await demo();
    const [target] = (await wishlist(userId)).items;
    if (target?.source.kind !== "product") throw new Error("нужен товар");
    await reserve(userId, target.source.productId);

    const given = await markGiven(userId, target.id, {
      fromName: "  Бакыт  ",
      at: GIVEN_AT,
    });
    expect(given).toMatchObject({
      status: "given",
      given: { fromName: "Бакыт", at: GIVEN_AT },
    });
    expect(await findIn(userId, target.id)).toMatchObject({
      status: "given",
      given: { fromName: "Бакыт", at: GIVEN_AT },
    });
    expect((await reservation())?.closedAt).toBe(NOW_ISO);
  });

  it("бронь своего желания ищется по ключу custom:<title>", async () => {
    const user = await newUser();
    const item = await addCustom(user.id, { title: "Плед" });
    await reserve(user.id, "custom:Плед");
    await reserve(user.id, "custom:Другое", "rs_other");
    await markGiven(user.id, item.id, { at: GIVEN_AT });
    expect((await reservation())?.closedAt).toBe(NOW_ISO);
    expect((await reservation("rs_other"))?.closedAt).toBeUndefined();
  });

  it("брони другого владельца с тем же ключом не закрываются", async () => {
    const userId = await demo();
    const [target] = (await wishlist(userId)).items;
    if (target?.source.kind !== "product") throw new Error("нужен товар");
    const stranger = await newUser();
    await reserve(stranger.id, target.source.productId);
    await markGiven(userId, target.id, { at: GIVEN_AT });
    expect((await reservation())?.closedAt).toBeUndefined();
  });

  it("без даты — VALIDATION", async () => {
    const user = await newUser();
    const item = await addCustom(user.id, { title: "Плед" });
    await expect(markGiven(user.id, item.id, {})).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("вернуть из «Подарили»", () => {
  it("без undo — активное, в конец, бронь остаётся закрытой", async () => {
    const userId = await demo();
    const before = await wishlist(userId);
    const target = before.items[0];
    if (target?.source.kind !== "product") throw new Error("нужен товар");
    await reserve(userId, target.source.productId);
    await markGiven(userId, target.id, { fromName: "Бакыт", at: GIVEN_AT });

    const restored = await restore(userId, target.id);
    expect(restored.status).toBe("active");
    expect(restored.given).toBeUndefined();
    expect(restored.order).toBe(maxOrder(before.items) + 1);
    expect((await sortedIds(userId)).at(-1)).toBe(target.id);
    expect((await reservation())?.closedAt).toBe(NOW_ISO);
  });

  it("с undo сразу после «подарили» — прежнее место, бронь снова открыта", async () => {
    const userId = await demo();
    const before = await wishlist(userId);
    const target = before.items[2];
    if (target?.source.kind !== "product") throw new Error("нужен товар");
    await reserve(userId, target.source.productId);
    await markGiven(userId, target.id, { at: GIVEN_AT });
    clock.advance(5_000);

    const restored = await restore(userId, target.id, { undo: true });
    expect(restored).toMatchObject({ status: "active", order: target.order });
    expect(restored.given).toBeUndefined();
    expect(await sortedIds(userId)).toEqual(
      before.items.map((item) => item.id),
    );
    const rs = await reservation();
    expect(rs).toBeDefined();
    expect(rs?.closedAt).toBeUndefined();
  });

  it("активное желание restore не трогает", async () => {
    const userId = await demo();
    const before = await wishlist(userId);
    const target = before.items[1];
    if (!target) throw new Error("нет желаний в демо");
    const result = await restore(userId, target.id);
    expect(result).toEqual(target);
    expect(await sortedIds(userId)).toEqual(
      before.items.map((item) => item.id),
    );
  });
});

describe("realtime", () => {
  it("каждая правка вишлиста публикует db:changed со scope wishlist", async () => {
    const user = await newUser();
    realtime.events.length = 0;

    const item = await addCustom(user.id, { title: "Плед" });
    expect(lastScope()).toContain("wishlist");

    await patch(user.id, item.id, { priority: "top" });
    expect(lastScope()).toContain("wishlist");

    const removed = await call<WishlistItem>(
      "DELETE",
      `/wishlist/items/${item.id}`,
      user.id,
    );
    expect(lastScope()).toContain("wishlist");

    await call("POST", `/wishlist/items/${item.id}/undelete`, user.id, removed);
    expect(lastScope()).toContain("wishlist");

    await call("POST", "/wishlist/reorder", user.id, { ids: [item.id] });
    expect(lastScope()).toContain("wishlist");

    await markGiven(user.id, item.id, { at: GIVEN_AT });
    expect(lastScope()).toEqual(
      expect.arrayContaining(["wishlist", "reservations"]),
    );

    await restore(user.id, item.id);
    expect(lastScope()).toEqual(
      expect.arrayContaining(["wishlist", "reservations"]),
    );

    expect(realtime.events).toHaveLength(7);
    expect(
      realtime.events.every((event) => "by" in event && event.by === user.id),
    ).toBe(true);
  });
});
