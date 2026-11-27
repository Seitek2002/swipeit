import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { decodePickRequest, encodePickRequest } from "@/shared/lib/share-codec";

import type { FeedResponse, Product } from "../catalog/types";
import type { MeResponse, Taste } from "../users/types";
import type { ProductSwipe, SwipeResponse } from "../wishlist/types";
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
import { computeTaste, inferInterests, isTasteJustFormed } from "./taste";

// Этап 7, T23 (сервер): вкус по лайкам — чистые функции и обработчики.
const stubPath = fileURLToPath(
  new URL("../../../../catalog-stub/products.json", import.meta.url),
);
const { items: stub } = parseProducts(
  JSON.parse(readFileSync(stubPath, "utf8")),
);

const product = (overrides: Partial<Product>): Product => ({
  id: "p",
  title: "Товар",
  description: "",
  category: "tech",
  interests: [],
  audience: "all",
  priceMin: 1000,
  priceMax: 1000,
  images: [{ src: "/x.svg", alt: "" }],
  offers: [
    { marketplace: "ozon", url: "https://ozon.ru", price: 1000, checkedAt: "" },
  ],
  popularity: 0.5,
  ...overrides,
});

const products = [
  product({ id: "gadget", category: "tech", interests: ["gadgets", "photo"] }),
  product({
    id: "console",
    category: "games",
    interests: ["gaming"],
    audience: "male",
  }),
  product({
    id: "cream",
    category: "beauty",
    interests: ["beauty", "wellness"],
    audience: "female",
  }),
  product({ id: "book", category: "books", interests: ["reading"] }),
];

let seq = 0;
const swipe = (
  productId: string,
  decision: ProductSwipe["decision"],
  context: ProductSwipe["context"] = { kind: "self" },
): ProductSwipe => {
  seq += 1;
  return {
    id: `sw_${seq}`,
    userId: "u_1",
    productId,
    decision,
    context,
    at: `2026-11-26T12:00:${String(seq % 60).padStart(2, "0")}.000Z`,
  };
};

describe("computeTaste", () => {
  it("«Хочу» +1, «Очень хочу» +2, «Мимо» −0.3 — каждому интересу и категории", () => {
    const taste = computeTaste(
      [
        swipe("gadget", "like"),
        swipe("gadget", "superlike"),
        swipe("book", "pass"),
      ],
      products,
    );
    expect(taste?.interests).toEqual({ gadgets: 3, photo: 3, reading: -0.3 });
    expect(taste?.categories).toEqual({ tech: 3, books: -0.3 });
    expect(taste?.likes).toBe(2);
  });

  it("вес не ниже −3, а «Хочу» после этого снова поднимает", () => {
    const passes = Array.from({ length: 15 }, () => swipe("book", "pass"));
    const low = computeTaste(passes, products);
    expect(low?.interests.reading).toBe(-3);
    expect(low?.categories.books).toBe(-3);
    const back = computeTaste([...passes, swipe("book", "like")], products);
    expect(back?.interests.reading).toBe(-2);
  });

  it("аудитория — только у «Хочу» товаров для неё и для него", () => {
    const taste = computeTaste(
      [
        swipe("cream", "like"),
        swipe("cream", "superlike"),
        swipe("console", "like"),
        swipe("console", "pass"),
        swipe("gadget", "like"),
      ],
      products,
    );
    expect(taste?.audience).toEqual({ female: 2, male: 1 });
    expect(taste?.likes).toBe(4);
  });

  it("свайпы по ссылке-фильтру и неизвестные товары не считаются; без своих свайпов — null", () => {
    const pick = { kind: "pick" as const, requestId: "pk_1" };
    expect(computeTaste([swipe("gadget", "like", pick)], products)).toBeNull();
    expect(computeTaste([], products)).toBeNull();
    const taste = computeTaste(
      [swipe("gadget", "like", pick), swipe("ghost", "like")],
      products,
    );
    expect(taste?.interests).toEqual({});
  });

  it("одна и та же история — один и тот же вкус; updatedAt — время последнего свайпа", () => {
    const history = [swipe("gadget", "like"), swipe("cream", "pass")];
    const a = computeTaste(history, products);
    const b = computeTaste(history, new Map(products.map((p) => [p.id, p])));
    expect(a).toEqual(b);
    expect(a?.updatedAt).toBe(history[1]?.at);
  });
});

describe("inferInterests", () => {
  const taste = (interests: Record<string, number>): Taste => ({
    interests,
    categories: {},
    audience: { female: 0, male: 0 },
    likes: 0,
    updatedAt: "",
  });

  it("вес от 2, по убыванию, не больше 4", () => {
    expect(
      inferInterests(
        taste({
          gadgets: 5,
          photo: 2,
          music: 1.9,
          gaming: 3,
          coffee: 4,
          travel: 2.5,
        }),
        { interests: [] },
      ),
    ).toEqual(["gadgets", "coffee", "gaming", "travel"]);
  });

  it("без своих интересов, «Не моё» и неизвестных id", () => {
    expect(
      inferInterests(taste({ gadgets: 5, photo: 4, coffee: 3, unknown: 9 }), {
        interests: ["gadgets"],
        mutedInterests: ["photo"],
      }),
    ).toEqual(["coffee"]);
    expect(inferInterests(null, { interests: [] })).toEqual([]);
  });

  it("при равном весе — порядок облака интересов", () => {
    expect(
      inferInterests(taste({ music: 2, coffee: 2, gadgets: 2 }), {
        interests: [],
      }),
    ).toEqual(["coffee", "gadgets", "music"]);
  });

  it("«вкус сложился» — один раз, когда впервые вывелись 2 интереса и тоста ещё не было", () => {
    const one = taste({ gadgets: 2 });
    const two = taste({ gadgets: 2, photo: 2 });
    const user = { interests: [] };
    expect(isTasteJustFormed(one, two, user)).toBe(true);
    expect(isTasteJustFormed(two, two, user)).toBe(false);
    expect(
      isTasteJustFormed(one, two, { ...user, seenHints: ["taste_toast"] }),
    ).toBe(false);
  });
});

// ── Обработчики ──────────────────────────────────────────────────────────

const NOW = new Date(2026, 10, 27, 12).getTime();
let server: MockServer;
let realtime: ReturnType<typeof createRecordingRealtime>;

const call = <T>(
  method: "GET" | "PATCH" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
  query?: Record<string, unknown>,
) => server.handle({ method, path, userId, body, query }) as Promise<T>;

const startServer = (catalog: Product[]) => {
  const clock = createFixedClock(NOW);
  realtime = createRecordingRealtime();
  server = createMockServer({
    catalog: createMemoryCatalog(catalog),
    clock,
    db: createMemoryDb(async () =>
      createSeedDb({ products: catalog, now: clock.now() }),
    ),
    realtime,
    random: createSeededRandom("taste-test"),
    settings: createMemorySettings(),
  });
};

const newUser = async () => (await call<MeResponse>("POST", "/users", null)).id;
const me = (userId: string) => call<MeResponse>("GET", "/me", userId);
const swipeVia = (
  userId: string,
  productId: string,
  decision: ProductSwipe["decision"],
  context: ProductSwipe["context"] = { kind: "self" },
) =>
  call<SwipeResponse>("POST", "/swipes", userId, {
    productId,
    decision,
    context,
  });
const feed = (
  userId: string,
  filters: Record<string, unknown> = {},
  extra: Record<string, unknown> = {},
) =>
  call<FeedResponse>("GET", "/catalog/feed", userId, undefined, {
    filters: JSON.stringify({
      budget: { min: 0, max: null },
      categories: [],
      marketplaces: [],
      ...filters,
    }),
    context: "self",
    ...extra,
  });

describe("вкус в обработчиках", () => {
  beforeEach(() => startServer(products));

  it("POST /swipes пересчитывает вкус, GET /me отдаёт inferredInterests", async () => {
    const userId = await newUser();
    expect((await me(userId)).inferredInterests).toEqual([]);
    await swipeVia(userId, "gadget", "superlike");
    const profile = await me(userId);
    expect(profile.taste?.interests).toEqual({ gadgets: 2, photo: 2 });
    expect(profile.inferredInterests).toEqual(["gadgets", "photo"]);
  });

  it("tasteJustFormed — ровно один раз, пока тост не отмечен", async () => {
    const userId = await newUser();
    expect((await swipeVia(userId, "book", "like")).tasteJustFormed).toBe(
      false,
    );
    // gadgets и photo впервые набирают 2 — вкус сложился.
    expect(
      (await swipeVia(userId, "gadget", "superlike")).tasteJustFormed,
    ).toBe(true);
    expect(
      (await swipeVia(userId, "console", "superlike")).tasteJustFormed,
    ).toBe(false);
    // Тост не отметили, отменили лайки и снова набрали — тост покажется ещё
    // раз; после отметки — уже никогда.
    await call("POST", "/me/hints", userId, { id: "taste_toast" });
    await call("POST", "/swipes/undo", userId, { context: { kind: "self" } });
    await call("POST", "/swipes/undo", userId, { context: { kind: "self" } });
    expect(
      (await swipeVia(userId, "gadget", "superlike")).tasteJustFormed,
    ).toBe(false);
  });

  it("«Вернуть» возвращает вкус точно в прежнее состояние", async () => {
    const userId = await newUser();
    await swipeVia(userId, "gadget", "like");
    await swipeVia(userId, "book", "pass");
    const before = (await me(userId)).taste;
    await swipeVia(userId, "cream", "superlike");
    expect((await me(userId)).taste).not.toEqual(before);
    await call("POST", "/swipes/undo", userId, { context: { kind: "self" } });
    expect((await me(userId)).taste).toEqual(before);

    // Отмена единственного свайпа — вкуса снова нет, как у нового профиля.
    const fresh = await newUser();
    await swipeVia(fresh, "gadget", "like");
    await call("POST", "/swipes/undo", fresh, { context: { kind: "self" } });
    expect((await me(fresh)).taste).toBeUndefined();
  });

  it("выбор по ссылке-фильтру вкус не трогает", async () => {
    const userId = await newUser();
    const response = await swipeVia(userId, "gadget", "superlike", {
      kind: "pick",
      requestId: "pk_1",
    });
    expect(response.tasteJustFormed).toBe(false);
    expect((await me(userId)).taste).toBeUndefined();
  });

  it("«Начать заново» убирает «Мимо» и из вкуса", async () => {
    const userId = await newUser();
    await swipeVia(userId, "gadget", "like");
    await swipeVia(userId, "book", "pass");
    await call("POST", "/swipes/restart", userId, {
      context: { kind: "self" },
    });
    expect((await me(userId)).taste?.interests).toEqual({
      gadgets: 1,
      photo: 1,
    });
  });

  it("профиль перечитывают, только когда поменялись выведенные интересы", async () => {
    const userId = await newUser();
    await swipeVia(userId, "book", "pass");
    const scopes = () => {
      const last = realtime.events.at(-1);
      return last?.type === "db:changed" ? last.scope : [];
    };
    expect(scopes()).not.toContain("users");
    await swipeVia(userId, "gadget", "superlike");
    expect(scopes()).toContain("users");
  });

  it("PATCH /me: свои интересы и «Не моё» убирают их из «Похоже, тебе нравится»", async () => {
    const userId = await newUser();
    await swipeVia(userId, "gadget", "superlike");
    await swipeVia(userId, "console", "superlike");
    expect((await me(userId)).inferredInterests).toEqual([
      "gadgets",
      "gaming",
      "photo",
    ]);
    // Подтвердил «Гаджеты», «Видеоигры» — «Не моё».
    const updated = await call<MeResponse>("PATCH", "/me", userId, {
      interests: ["gadgets"],
      mutedInterests: ["gaming"],
    });
    expect(updated.interests).toEqual(["gadgets"]);
    expect(updated.mutedInterests).toEqual(["gaming"]);
    expect(updated.inferredInterests).toEqual(["photo"]);
    // «Не моё» на своём интересе снимает его из своих, и наоборот.
    const muted = await call<MeResponse>("PATCH", "/me", userId, {
      mutedInterests: ["gaming", "gadgets"],
    });
    expect(muted.interests).toEqual([]);
    const unmuted = await call<MeResponse>("PATCH", "/me", userId, {
      interests: ["gaming"],
    });
    expect(unmuted.mutedInterests).toEqual(["gadgets"]);
  });

  it("PATCH /me: неизвестный интерес и один интерес в обоих списках — VALIDATION", async () => {
    const userId = await newUser();
    await expect(
      call("PATCH", "/me", userId, { interests: ["nope"] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      call("PATCH", "/me", userId, {
        interests: ["coffee"],
        mutedInterests: ["coffee"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("у демо-пользователя вкус уже посчитан по сиду", async () => {
    const demo = await call<MeResponse>("POST", "/auth/demo", null);
    expect(demo.id).toBe(DEMO_USER_ID);
    expect(demo.taste?.likes).toBeGreaterThan(0);
  });
});

describe("лента через обработчик", () => {
  beforeEach(() => startServer(stub));

  it("первая порция нового профиля — 10 товаров из 10 разных категорий", async () => {
    const userId = await newUser();
    const { items } = await feed(userId);
    expect(items).toHaveLength(10);
    expect(new Set(items.map((p) => p.category)).size).toBe(10);
    // Детерминированно: перезапрос даёт ту же порцию.
    expect((await feed(userId)).items.map((p) => p.id)).toEqual(
      items.map((p) => p.id),
    );
  });

  it("выданная колода не перемешивается: новый вкус — только в следующих порциях", async () => {
    const userId = await newUser();
    const first = (await feed(userId)).items;
    const [liked, ...rest] = first;
    await swipeVia(userId, liked?.id ?? "", "superlike");
    const next = await feed(
      userId,
      {},
      { exclude: rest.map((p) => p.id).join(",") },
    );
    const issued = new Set(first.map((p) => p.id));
    expect(next.items.some((p) => issued.has(p.id))).toBe(false);
  });

  it("аудитория из фильтров — в ленте и в счётчике", async () => {
    const userId = await newUser();
    const count = (filters: Record<string, unknown>) =>
      call<{ count: number }>("GET", "/catalog/count", userId, undefined, {
        filters: JSON.stringify({
          budget: { min: 0, max: null },
          categories: [],
          marketplaces: [],
          ...filters,
        }),
        context: "self",
      });
    const all = (await count({})).count;
    const forHim = (await count({ audience: "male" })).count;
    expect(all).toBe(stub.length);
    expect(forHim).toBe(stub.filter((p) => p.audience !== "female").length);
    expect((await count({ audience: "all" })).count).toBe(all);
    const items = (await feed(userId, { audience: "male" }, { limit: 50 }))
      .items;
    expect(items.every((p) => p.audience !== "female")).toBe(true);
  });

  it("ссылка-фильтр с «для неё»: аудитория едет в ссылке и сужает ленту друга", async () => {
    const encoded = encodePickRequest({
      id: "pk_1",
      from: { name: "Азамат", avatarColor: "mint" },
      filters: {
        budget: { min: 0, max: null },
        categories: [],
        marketplaces: [],
        audience: "female",
      },
      hidePrices: false,
    });
    const decoded = decodePickRequest(encoded);
    expect(decoded?.filters.audience).toBe("female");
    const friend = await newUser();
    const items = (
      await call<FeedResponse>("GET", "/catalog/feed", friend, undefined, {
        filters: JSON.stringify(decoded?.filters),
        context: "pick:pk_1",
        limit: 50,
      })
    ).items;
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((p) => p.audience !== "male")).toBe(true);
  });
});
