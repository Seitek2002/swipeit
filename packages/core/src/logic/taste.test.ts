import { describe, expect, it } from "vitest";

import type { Product } from "../api/catalog/types";
import type { Taste } from "../api/users/types";
import type { ProductSwipe } from "../api/wishlist/types";
import { computeTaste, inferInterests, isTasteJustFormed } from "./taste";

// Этап 7, T23: вкус по лайкам — чистые функции (обработчики — в тестах мока).
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

  it("«вкус сложился» — 2 интереса и не меньше 4 лайков, тоста ещё не было, отправка не открылась этим свайпом", () => {
    const user = { interests: [] };
    const two = (likes: number) => ({
      ...taste({ gadgets: 2, photo: 2 }),
      likes,
    });
    expect(isTasteJustFormed(two(2), user)).toBe(false);
    expect(isTasteJustFormed(two(4), user)).toBe(true);
    expect(
      isTasteJustFormed({ ...taste({ gadgets: 3 }), likes: 6 }, user),
    ).toBe(false);
    expect(
      isTasteJustFormed(two(4), { ...user, seenHints: ["taste_toast"] }),
    ).toBe(false);
    expect(isTasteJustFormed(two(5), user, true)).toBe(false);
  });
});
