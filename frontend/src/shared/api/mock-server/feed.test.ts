import { describe, expect, it } from "vitest";

import { CATEGORY_IDS, type CategoryId } from "@/shared/config";

import { EMPTY_FILTERS } from "../catalog/constants";
import type { Product } from "../catalog/types";
import type { ProductSwipe } from "../wishlist/types";
import {
  PAGE_SIZE,
  audienceShift,
  contextKey,
  matchesFilters,
  parseContextKey,
  rankProducts,
  scoreProduct,
} from "./feed";
import { computeTaste } from "./taste";

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
  dateKey: "2026-11-26",
  excludeIds: new Set<string>(),
  explore: false,
  filters: EMPTY_FILTERS,
  profile: { interests: [] as string[] },
  userId: "u_1",
};

// Каталог «как настоящий»: 15 категорий по 8 товаров, у каждой категории
// свои интересы, аудитория и популярность вперемешку.
const INTERESTS: Record<CategoryId, string[]> = {
  tech: ["gadgets", "photo"],
  beauty: ["beauty"],
  home: ["home"],
  kitchen: ["cooking", "coffee"],
  sport: ["fitness"],
  outdoor: ["mountains", "travel"],
  books: ["reading"],
  hobby: ["art"],
  fashion: ["fashion"],
  jewelry: ["fashion", "beauty"],
  games: ["gaming", "boardgames"],
  kids: ["boardgames"],
  auto: ["cars"],
  pets: ["pets"],
  experiences: ["travel", "music"],
};
const AUDIENCE_CYCLE = ["all", "female", "all", "male"] as const;
// Сколько товаров в категории — как в каталоге Товароведа: техники 13,
// игр 7, остального по 8.
const COUNTS: Partial<Record<CategoryId, number>> = { tech: 13, games: 7 };
const realisticCatalog = (perCategory = COUNTS): Product[] =>
  CATEGORY_IDS.flatMap((category, c) =>
    Array.from({ length: perCategory[category] ?? 8 }, (_, i) =>
      product({
        id: `${category}_${i}`,
        category,
        interests: INTERESTS[category].slice(0, 1 + (i % 2)),
        audience: AUDIENCE_CYCLE[(i + c) % 4],
        popularity: ((i * 37 + c * 11) % 100) / 100,
      }),
    ),
  );

let swipeSeq = 0;
const swipe = (
  productId: string,
  decision: ProductSwipe["decision"],
): ProductSwipe => {
  swipeSeq += 1;
  return {
    id: `sw_${swipeSeq}`,
    userId: "u_1",
    productId,
    decision,
    context: { kind: "self" },
    at: new Date(Date.UTC(2026, 10, 26, 12, 0, swipeSeq)).toISOString(),
  };
};

const noAdjacentSameCategory = (items: Product[]) =>
  items.every(
    (item, index) =>
      index === 0 || item.category !== items[index - 1]?.category,
  );

// Правило TECH_SPEC §6, п. 5: не больше двух одной категории подряд.
const noThreeInARow = (items: Product[]) =>
  items.every(
    (item, index) =>
      index < 2 ||
      item.category !== items[index - 1]?.category ||
      item.category !== items[index - 2]?.category,
  );

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

  it("аудитория: «для него» — товары для него и для всех; нет поля — все", () => {
    const forHer = product({ audience: "female" });
    const forHim = product({ audience: "male" });
    const forAll = product({ audience: "all" });
    const male = { ...EMPTY_FILTERS, audience: "male" as const };
    expect(matchesFilters(forHim, male)).toBe(true);
    expect(matchesFilters(forAll, male)).toBe(true);
    expect(matchesFilters(forHer, male)).toBe(false);
    for (const p of [forHer, forHim, forAll]) {
      expect(matchesFilters(p, EMPTY_FILTERS)).toBe(true);
      expect(matchesFilters(p, { ...EMPTY_FILTERS, audience: "all" })).toBe(
        true,
      );
    }
  });
});

describe("ранжирование", () => {
  it("выбранные самим интересы поднимают товар выше популярности", () => {
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
      profile: { interests: ["music", "gadgets"] },
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
    const result = rankProducts({ ...base, products });
    expect(result).toHaveLength(9);
    expect(noThreeInARow(result)).toBe(true);
  });

  it("две любимые категории чередуются, а не идут парами", () => {
    const products = realisticCatalog({ tech: 12, games: 12 });
    const liked = [
      ...products.filter((p) => p.category === "tech").slice(0, 4),
      ...products.filter((p) => p.category === "games").slice(0, 4),
    ];
    const history = liked.map((p) => swipe(p.id, "like"));
    const page = rankProducts({
      ...base,
      products,
      excludeIds: new Set(history.map((s) => s.productId)),
      profile: { interests: [], taste: computeTaste(history, products) },
    }).slice(0, PAGE_SIZE);
    const isTarget = (p: Product) =>
      p.category === "tech" || p.category === "games";
    expect(page.filter(isTarget).length).toBeGreaterThanOrEqual(6);
    expect(noAdjacentSameCategory(page)).toBe(true);
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

describe("разведка", () => {
  it("первая порция нового профиля — 10 товаров из 10 разных категорий, сначала «для всех»", () => {
    const products = realisticCatalog();
    const page = rankProducts({ ...base, products, explore: true }).slice(
      0,
      PAGE_SIZE,
    );
    expect(page).toHaveLength(10);
    expect(new Set(page.map((p) => p.category)).size).toBe(10);
    // В каждой категории есть товары «для всех» — их и берём, самые
    // популярные из них.
    for (const item of page) {
      expect(item.audience).toBe("all");
      const best = Math.max(
        ...products
          .filter((p) => p.category === item.category && p.audience === "all")
          .map((p) => p.popularity),
      );
      expect(item.popularity).toBe(best);
    }
  });

  it("в каждой порции 2 места — категориям, которые ещё не пробовали", () => {
    const products = realisticCatalog();
    const history = [
      ...products.filter((p) => p.category === "tech").slice(0, 5),
      ...products.filter((p) => p.category === "games").slice(0, 5),
    ].map((p) => swipe(p.id, "like"));
    const taste = computeTaste(history, products);
    const page = rankProducts({
      ...base,
      products,
      excludeIds: new Set(history.map((s) => s.productId)),
      profile: { interests: [], taste },
    }).slice(0, PAGE_SIZE);
    const untried = page.filter(
      (p) => p.category !== "tech" && p.category !== "games",
    );
    expect(untried.length).toBeGreaterThanOrEqual(2);
  });
});

describe("вкус в ленте", () => {
  it("8 «Хочу» на технике и играх, остальное «Мимо» → в следующей порции ≥ 6 из 10 — техника и игры, не больше двух одной категории подряд", () => {
    const products = realisticCatalog();
    const history: ProductSwipe[] = [];
    const isTarget = (p: Product) =>
      p.category === "tech" || p.category === "games";
    let likes = 0;
    let deck: Product[] = [];
    // Как в браузере: порция за порцией, «Хочу» — технике и играм, пока их
    // не наберётся 8, остальное — «Мимо».
    while (likes < 8) {
      const taste = computeTaste(history, products);
      deck = rankProducts({
        ...base,
        products,
        explore: history.length === 0,
        excludeIds: new Set(history.map((s) => s.productId)),
        profile: { interests: [], taste },
      }).slice(0, PAGE_SIZE);
      expect(deck.length).toBeGreaterThan(0);
      while (deck.length > 0 && likes < 8) {
        const card = deck.shift() as Product;
        const like = isTarget(card);
        if (like) likes += 1;
        history.push(swipe(card.id, like ? "like" : "pass"));
      }
    }
    // Недосвайпанные карточки колоды уходят в exclude — их не перемешиваем.
    const taste = computeTaste(history, products);
    const next = rankProducts({
      ...base,
      products,
      excludeIds: new Set([
        ...history.map((s) => s.productId),
        ...deck.map((p) => p.id),
      ]),
      profile: { interests: [], taste },
    }).slice(0, PAGE_SIZE);
    expect(next).toHaveLength(10);
    expect(next.filter(isTarget).length).toBeGreaterThanOrEqual(6);
    expect(noThreeInARow(next)).toBe(true);
    // Игр в каталоге всего 7 — их почти все уже лайкнули. Пока игры
    // остаются, техника с ними чередуется; две техники подряд — только
    // когда другой любимой категории под рукой нет.
    next.forEach((item, index) => {
      if (index > 0 && item.category === next[index - 1]?.category) {
        const rest = next.slice(index);
        expect(rest.some((p) => p.category === "games")).toBe(false);
      }
    });
  });

  it("«Не моё» на интересе → среди первых 5 следующей порции его нет, если есть другие", () => {
    const products = realisticCatalog();
    // Раньше лайкал гаджеты — вкус их поднимает, но «Не моё» сильнее.
    const history = products
      .filter((p) => p.interests.includes("gadgets"))
      .slice(0, 5)
      .map((p) => swipe(p.id, "like"));
    const taste = computeTaste(history, products);
    const excludeIds = new Set(history.map((s) => s.productId));
    const before = rankProducts({
      ...base,
      products,
      excludeIds,
      profile: { interests: [], taste },
    }).slice(0, 5);
    expect(before.some((p) => p.interests.includes("gadgets"))).toBe(true);

    const after = rankProducts({
      ...base,
      products,
      excludeIds,
      profile: { interests: [], mutedInterests: ["gadgets"], taste },
    });
    expect(after.slice(0, 5).some((p) => p.interests.includes("gadgets"))).toBe(
      false,
    );
    // Опускаются, но не пропадают: других кандидатов не останется — покажем.
    expect(after.some((p) => p.interests.includes("gadgets"))).toBe(true);
  });

  it("6 «Хочу» товаров «для неё» опускают товары «для него», но не убирают их", () => {
    const products = realisticCatalog();
    const history = products
      .filter((p) => p.audience === "female")
      .slice(0, 6)
      .map((p) => swipe(p.id, "like"));
    const taste = computeTaste(history, products);
    expect(taste?.audience).toEqual({ female: 6, male: 0 });
    expect(audienceShift(taste, undefined)).toBe("female");
    // Сам выбрал «для него» или «для неё» в фильтрах — сдвига нет.
    expect(audienceShift(taste, "male")).toBeNull();

    const forHim = products.find((p) => p.audience === "male") as Product;
    const forAll = products.find((p) => p.audience === "all") as Product;
    const profile = { interests: [], taste };
    expect(
      scoreProduct(forHim, profile, null, "seed") -
        scoreProduct(forHim, profile, "female", "seed"),
    ).toBeCloseTo(1);
    expect(scoreProduct(forAll, profile, "female", "seed")).toBe(
      scoreProduct(forAll, profile, null, "seed"),
    );

    const excludeIds = new Set(history.map((s) => s.productId));
    const ranked = rankProducts({ ...base, products, excludeIds, profile });
    const neutral = rankProducts({
      ...base,
      products,
      excludeIds,
      profile: { interests: [] },
    });
    const male = (list: Product[]) =>
      list.filter((p) => p.audience === "male").map((p) => p.id);
    // Не пропали: столько же товаров «для него», и счётчик тот же.
    expect(male(ranked).sort()).toEqual(male(neutral).sort());
    expect(ranked).toHaveLength(neutral.length);
    // Но опустились: в среднем стоят дальше от начала ленты.
    const avgIndex = (list: Product[]) => {
      const ids = new Set(male(list));
      const indices = list.flatMap((p, i) => (ids.has(p.id) ? [i] : []));
      return indices.reduce((a, b) => a + b, 0) / indices.length;
    };
    expect(avgIndex(ranked)).toBeGreaterThan(avgIndex(neutral));
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

describe("«Не моё» и правило повторов", () => {
  it("уход от повтора категории не вытаскивает «Не моё» вперёд", () => {
    // Любимая категория — техника, но в ней остался только товар с «Не моё»;
    // красота не любимая. Вместо повтора красоты лента не должна ставить
    // приглушённую колонку второй.
    const products = [
      product({ id: "b1", category: "beauty", popularity: 0.9 }),
      product({ id: "b2", category: "beauty", popularity: 0.8 }),
      product({ id: "b3", category: "beauty", popularity: 0.7 }),
      product({ id: "t_muted", category: "tech", interests: ["music"] }),
    ];
    const ranked = rankProducts({
      ...base,
      products,
      profile: {
        interests: [],
        mutedInterests: ["music"],
        taste: {
          interests: {},
          categories: { tech: 3 },
          audience: { female: 0, male: 0 },
          likes: 3,
          updatedAt: "2026-11-26T00:00:00.000Z",
        },
      },
    });
    expect(ranked.at(-1)?.id).toBe("t_muted");
  });
});

describe("обучающая карточка (п. 2)", () => {
  const products = realisticCatalog();
  // Не самый популярный товар своей категории: без guideId разведка его не
  // взяла бы.
  const home = products
    .filter((p) => p.category === "home" && p.audience === "all")
    .sort((a, b) => a.popularity - b.popularity);
  const guide = home[0]!;

  it("новый профиль: первым — обучающий товар, в порции всё ещё 10 разных категорий", () => {
    const page = rankProducts({
      ...base,
      products,
      explore: true,
      guideId: guide.id,
    }).slice(0, PAGE_SIZE);
    expect(page[0]?.id).toBe(guide.id);
    expect(new Set(page.map((p) => p.category)).size).toBe(10);
    // Он занял место своей категории — другого «дома» в разведке нет.
    expect(page.filter((p) => p.category === "home")).toHaveLength(1);
  });

  it("после разведки (уже есть свайпы) — тоже первым", () => {
    const ranked = rankProducts({ ...base, products, guideId: guide.id });
    expect(ranked[0]?.id).toBe(guide.id);
    expect(ranked.filter((p) => p.id === guide.id)).toHaveLength(1);
  });

  it("свайпнут или уже в колоде — лента как без него", () => {
    const without = rankProducts({
      ...base,
      products,
      explore: true,
      excludeIds: new Set([guide.id]),
    });
    const withGuide = rankProducts({
      ...base,
      products,
      explore: true,
      excludeIds: new Set([guide.id]),
      guideId: guide.id,
    });
    expect(withGuide.map((p) => p.id)).toEqual(without.map((p) => p.id));
  });

  it("не проходит фильтры (аудитория, бюджет) — первой идёт обычная карточка", () => {
    const female = products.find(
      (p) => p.category === "home" && p.audience === "female",
    )!;
    const male = rankProducts({
      ...base,
      products,
      filters: { ...EMPTY_FILTERS, audience: "male" },
      guideId: female.id,
    });
    expect(male.some((p) => p.id === female.id)).toBe(false);

    const cheap = rankProducts({
      ...base,
      products: [
        ...products,
        product({
          id: "guide",
          category: "home",
          priceMin: 2950,
          priceMax: 2950,
        }),
      ],
      filters: { ...EMPTY_FILTERS, budget: { min: 0, max: 2000 } },
      guideId: "guide",
    });
    expect(cheap[0]?.id).not.toBe("guide");
  });

  it("нет в каталоге — лента как без него", () => {
    const ranked = rankProducts({ ...base, products, guideId: "p_none" });
    expect(ranked.map((p) => p.id)).toEqual(
      rankProducts({ ...base, products }).map((p) => p.id),
    );
  });
});
