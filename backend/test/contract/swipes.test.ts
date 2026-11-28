import type { FeedResponse, Product } from "@swipeit/core/api/catalog/types";
import type { MeResponse } from "@swipeit/core/api/users/types";
import type {
  SwipeContext,
  SwipeResponse,
} from "@swipeit/core/api/wishlist/types";
import { GUIDE_PRODUCT_ID } from "@swipeit/core/config";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type ApiClient,
  type Caller,
  CLIENTS,
  createMockClient,
  createServerClient,
  testCatalog,
} from "./client";

// Контрактный тест ленты и свайпов (BACKEND.md B06): тот же сценарий на моке
// и на сервере. Каталог — настоящий (catalog/).
const SELF: SwipeContext = { kind: "self" };

describe.each(CLIENTS)("лента и свайпы — %s", (_name, create) => {
  let api: ApiClient;
  let me: Caller;
  let products: readonly Product[];
  beforeEach(async () => {
    api = await create();
    ({ caller: me } = await api.newUser());
    ({ products } = await testCatalog());
  });
  afterEach(() => api.close());

  const feed = (query: Record<string, unknown> = {}) =>
    api.call<FeedResponse>(me, "GET", "/catalog/feed", undefined, query);
  const swipe = (
    productId: string,
    decision: "like" | "pass" | "superlike",
    context: SwipeContext = SELF,
  ) =>
    api.call<SwipeResponse>(me, "POST", "/swipes", {
      productId,
      decision,
      context,
    });
  const undo = (context: SwipeContext = SELF) =>
    api.call<{ productId: string; wishCount: number }>(
      me,
      "POST",
      "/swipes/undo",
      { context },
    );
  const profile = () => api.call<MeResponse>(me, "GET", "/me");
  // Товары разных категорий — чтобы вкус заметно менялся.
  const byCategory = (category: string, index = 0) => {
    const product = products.filter((p) => p.category === category)[index];
    if (!product) throw new Error(`Нет товара категории ${category}`);
    return product.id;
  };

  it("в первой порции сначала обучающая карточка, всего 10 разных категорий", async () => {
    const page = await feed();
    expect(page.items).toHaveLength(10);
    expect(page.items[0]?.id).toBe(GUIDE_PRODUCT_ID);
    expect(new Set(page.items.map((p) => p.category)).size).toBe(10);
    expect(page.total).toBe(products.length);
    const { count } = await api.call<{ count: number }>(
      me,
      "GET",
      "/catalog/count",
    );
    expect(count).toBe(products.length);

    await api.call(me, "POST", "/me/hints", { id: "deck_guide" });
    expect((await feed()).items[0]?.id).not.toBe(GUIDE_PRODUCT_ID);
  });

  it("обучающая карточка: фильтр бюджета её не убирает (Y03)", async () => {
    const filters = JSON.stringify({
      budget: { min: 0, max: 2000 },
      categories: [],
      marketplaces: [],
    });
    const page = await feed({ filters });
    expect(page.items[0]?.id).toBe(GUIDE_PRODUCT_ID);
    expect(page.items.slice(1).every((p) => p.priceMin <= 2000)).toBe(true);
  });

  it("обучающий товар выбран другу — первым в своей ленте его нет", async () => {
    const { caller: friend } = await api.newUser();
    await api.call(friend, "PATCH", "/me", { name: "Бакыт" });
    await api.call(friend, "POST", "/swipes", {
      productId: GUIDE_PRODUCT_ID,
      decision: "like",
      context: SELF,
    });
    await api.befriend(me, friend);
    await api.call(me, "PATCH", "/me", { name: "Асель" });
    const reservation = await api.call<{ id: string }>(
      me,
      "POST",
      "/reservations",
      { ownerId: friend.id, itemKey: GUIDE_PRODUCT_ID },
    );
    expect((await feed()).items[0]?.id).not.toBe(GUIDE_PRODUCT_ID);
    // Бронь сняли — подсказка снова на нём.
    await api.call(me, "DELETE", `/reservations/${reservation.id}`);
    expect((await feed()).items[0]?.id).toBe(GUIDE_PRODUCT_ID);
  });

  it("свайпнутые уходят из ленты и из счётчика, exclude — тоже", async () => {
    const [first, second] = (await feed()).items;
    await swipe(first?.id ?? "", "pass");
    const page = await feed({ exclude: second?.id });
    const ids = page.items.map((p) => p.id);
    expect(ids).not.toContain(first?.id);
    expect(ids).not.toContain(second?.id);
    expect(page.total).toBe(products.length - 2);
    await undo();
    expect((await feed()).total).toBe(products.length);
  });

  it("«Вернуть» возвращает вкус точно в прежнее состояние", async () => {
    await swipe(byCategory("tech"), "like");
    await swipe(byCategory("books"), "pass");
    const before = (await profile()).taste;
    await swipe(byCategory("beauty"), "superlike");
    expect((await profile()).taste).not.toEqual(before);
    expect((await undo()).productId).toBe(byCategory("beauty"));
    expect((await profile()).taste).toEqual(before);
    await undo();
    await undo();
    expect((await profile()).taste).toBeUndefined();
    await expect(undo()).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("5 «Хочу» открывают отправку один раз", async () => {
    const ids = products.slice(0, 7).map((p) => p.id);
    const responses: SwipeResponse[] = [];
    for (const id of ids.slice(0, 6)) responses.push(await swipe(id, "like"));
    expect(responses.map((r) => r.wishCount)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(responses.map((r) => r.shareJustUnlocked)).toEqual([
      false,
      false,
      false,
      false,
      true,
      false,
    ]);
    expect(responses.map((r) => r.shareUnlocked)).toEqual([
      false,
      false,
      false,
      false,
      true,
      true,
    ]);
    expect(responses[0]?.wishlistItemId).toEqual(expect.any(String));
    // После отмены ниже порога отправка не закрывается.
    await undo();
    await undo();
    const after = await swipe(ids[6] ?? "", "pass");
    expect(after).toMatchObject({
      wishCount: 4,
      shareUnlocked: true,
      shareJustUnlocked: false,
    });
  });

  it("«Мимо» после «Хочу» убирает желание; повтор «Хочу» не дублирует", async () => {
    const id = byCategory("tech");
    const liked = await swipe(id, "like");
    const again = await swipe(id, "superlike");
    expect(again.wishlistItemId).toBe(liked.wishlistItemId);
    expect(again.wishCount).toBe(1);
    const passed = await swipe(id, "pass");
    expect(passed.wishCount).toBe(0);
    expect(passed.wishlistItemId).toBeUndefined();
  });

  it("выбор по ссылке-фильтру не трогает вишлист, вкус и свою ленту", async () => {
    const pick: SwipeContext = { kind: "pick", requestId: "pk_1" };
    const id = byCategory("tech");
    const response = await swipe(id, "superlike", pick);
    expect(response).toMatchObject({ wishCount: 0, tasteJustFormed: false });
    expect(response.wishlistItemId).toBeUndefined();
    expect((await profile()).taste).toBeUndefined();
    expect((await feed()).total).toBe(products.length);
    const picked = await feed({ context: "pick:pk_1" });
    expect(picked.items.map((p) => p.id)).not.toContain(id);
  });

  it("«Начать заново» возвращает только «Мимо» этого контекста", async () => {
    const [a, b, c] = (await feed()).items;
    await swipe(a?.id ?? "", "pass");
    await swipe(b?.id ?? "", "like");
    await swipe(c?.id ?? "", "pass", { kind: "pick", requestId: "pk_1" });
    const { removed } = await api.call<{ removed: number }>(
      me,
      "POST",
      "/swipes/restart",
      { context: SELF },
    );
    expect(removed).toBe(1);
    expect((await feed()).total).toBe(products.length - 1);
  });

  it("ошибки: неизвестный товар — NOT_FOUND, неверное решение — VALIDATION", async () => {
    await expect(swipe("p_nope", "like")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await expect(
      api.call(me, "POST", "/swipes", {
        productId: products[0]?.id,
        decision: "maybe",
        context: SELF,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(feed({ filters: "{не json" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("идеи для Санты (P05): лента с бюджетом только читает — вишлист и вкус не меняются", async () => {
    const page = await feed({
      filters: JSON.stringify({
        budget: { min: 0, max: 2000 },
        categories: [],
        marketplaces: [],
      }),
      limit: 30,
    });
    expect(page.items.length).toBeGreaterThan(0);
    // Обучающая карточка фильтром не убирается (Y03) — она не товар.
    expect(
      page.items
        .filter((p) => p.id !== GUIDE_PRODUCT_ID)
        .every((p) => p.priceMin <= 2000),
    ).toBe(true);
    const me1 = await profile();
    expect(me1.taste).toBeUndefined();
    const wishlist = await api.call<{ items: unknown[]; wishCount: number }>(
      me,
      "GET",
      "/wishlist",
    );
    expect(wishlist).toMatchObject({ items: [], wishCount: 0 });
  });

  it("товар, магазины, meta и занятия — без профиля", async () => {
    const product = products[0];
    expect(
      await api.call<Product>(null, "GET", `/catalog/products/${product?.id}`),
    ).toEqual(product);
    await expect(
      api.call(null, "GET", "/catalog/products/p_nope"),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const stores = await api.call<{
      categories: string[];
      marketplaces: string[];
    }>(null, "GET", "/catalog/stores");
    expect(stores.marketplaces.length).toBeGreaterThan(0);
    // Только категории с товарами (U09): «Впечатлений» в каталоге нет.
    const used = new Set(products.map((p) => p.category));
    expect(stores.categories.length).toBe(used.size);
    expect(stores.categories).toContain("tech");
    expect(stores.categories).not.toContain("experiences");
    expect(await api.call(null, "GET", "/catalog/meta")).toBeTruthy();
    const all = await api.call<unknown[]>(null, "GET", "/activities");
    const cheap = await api.call<unknown[]>(
      null,
      "GET",
      "/activities",
      undefined,
      {
        filters: JSON.stringify({
          categories: [],
          budgetPerPerson: { min: 0, max: 500 },
        }),
      },
    );
    expect(cheap.length).toBeLessThan(all.length);
  });
});

describe("одинаковый сид — одинаковая лента", () => {
  it("мок и сервер отдают одну и ту же первую и вторую порции", async () => {
    const mock = await createMockClient();
    const server = await createServerClient();
    const id = "u_same_seed";
    const pages = async (api: ApiClient) => {
      const caller = await api.userWithId(id);
      const first = await api.call<FeedResponse>(
        caller,
        "GET",
        "/catalog/feed",
      );
      // Свайп первой карточки (разведка закончилась) — и следующая порция
      // уже по вкусу.
      await api.call(caller, "POST", "/swipes", {
        productId: first.items[1]?.id,
        decision: "superlike",
        context: SELF,
      });
      const second = await api.call<FeedResponse>(
        caller,
        "GET",
        "/catalog/feed",
        undefined,
        { exclude: first.items.map((p) => p.id).join(",") },
      );
      return [first, second].map((page) => page.items.map((p) => p.id));
    };
    const fromMock = await pages(mock);
    const fromServer = await pages(server);
    expect(fromServer).toEqual(fromMock);
    expect(fromServer[0]).toHaveLength(10);
    await mock.close();
    await server.close();
  });
});
