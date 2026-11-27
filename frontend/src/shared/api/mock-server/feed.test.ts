import { describe, expect, it } from "vitest";

import { EMPTY_FILTERS } from "../catalog/constants";
import type { Product } from "../catalog/types";
import {
  contextKey,
  diversify,
  matchesFilters,
  parseContextKey,
  rankProducts,
} from "./feed";

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
    {
      marketplace: "ozon",
      url: "https://ozon.ru",
      price: 1000,
      checkedAt: "2026-11-27",
    },
  ],
  popularity: 0.5,
  ...overrides,
});

const base = {
  audience: "all" as const,
  dateKey: "2026-11-26",
  excludeIds: new Set<string>(),
  filters: EMPTY_FILTERS,
  interests: [] as string[],
  userId: "u_1",
};

describe("фильтры ленты", () => {
  it("бюджет — пересечение диапазонов", () => {
    const p = product({ priceMin: 2000, priceMax: 4000 });
    const filters = (min: number, max: null | number) => ({
      ...EMPTY_FILTERS,
      budget: { min, max },
    });
    expect(matchesFilters(p, filters(0, 3000))).toBe(true);
    expect(matchesFilters(p, filters(3500, null))).toBe(true);
    expect(matchesFilters(p, filters(0, 1999))).toBe(false);
    expect(matchesFilters(p, filters(4001, null))).toBe(false);
  });

  it("магазины — хотя бы один оффер", () => {
    const p = product({});
    expect(
      matchesFilters(p, { ...EMPTY_FILTERS, marketplaces: ["ozon"] }),
    ).toBe(true);
    expect(
      matchesFilters(p, { ...EMPTY_FILTERS, marketplaces: ["wildberries"] }),
    ).toBe(false);
  });
});

describe("ранжирование", () => {
  it("совпавшие интересы поднимают товар выше популярности", () => {
    const products = [
      product({ id: "popular", popularity: 1, category: "home" }),
      product({
        id: "matched",
        popularity: 0,
        interests: ["music", "gadgets"],
      }),
    ];
    const ranked = rankProducts({
      ...base,
      products,
      interests: ["music", "gadgets"],
    });
    expect(ranked[0]?.id).toBe("matched");
  });

  it("разброс детерминирован: тот же пользователь и день — тот же порядок", () => {
    const products = Array.from({ length: 20 }, (_, i) =>
      product({ id: `p${i}`, category: i % 2 ? "tech" : "home" }),
    );
    const first = rankProducts({ ...base, products }).map((p) => p.id);
    const again = rankProducts({ ...base, products }).map((p) => p.id);
    const otherDay = rankProducts({
      ...base,
      products,
      dateKey: "2026-11-27",
    }).map((p) => p.id);
    expect(again).toEqual(first);
    expect(otherDay).not.toEqual(first);
  });

  it("не больше двух товаров одной категории подряд, если есть другие", () => {
    const products = [
      ...Array.from({ length: 6 }, (_, i) =>
        product({ id: `t${i}`, category: "tech", popularity: 1 }),
      ),
      ...Array.from({ length: 3 }, (_, i) =>
        product({ id: `h${i}`, category: "home", popularity: 0 }),
      ),
    ];
    const result = diversify(products);
    const categories = result.map((p) => p.category);
    for (let i = 2; i < 6; i += 1) {
      const run = categories.slice(i - 2, i + 1);
      expect(run.every((c) => c === run[0])).toBe(false);
    }
    expect(result).toHaveLength(9);
  });

  it("исключённые не попадают в ленту", () => {
    const products = [product({ id: "a" }), product({ id: "b" })];
    const ranked = rankProducts({
      ...base,
      products,
      excludeIds: new Set(["a"]),
    });
    expect(ranked.map((p) => p.id)).toEqual(["b"]);
  });
});

describe("контекст свайпа", () => {
  it("строка и обратно", () => {
    expect(contextKey({ kind: "self" })).toBe("self");
    expect(contextKey({ kind: "pick", requestId: "r1" })).toBe("pick:r1");
    expect(parseContextKey("pick:r1")).toEqual({
      kind: "pick",
      requestId: "r1",
    });
    expect(parseContextKey(undefined)).toEqual({ kind: "self" });
  });
});
