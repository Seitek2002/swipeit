import type { Audience } from "@/shared/config";

import type { Product, ProductFilters } from "../catalog/types";
import type { SwipeContext } from "../wishlist/types";
import { seededUnit } from "./random";

// Алгоритм ленты (TECH_SPEC §6 «Алгоритм ленты»). Чистые функции — их
// проверяют тесты и вызывает обработчик /catalog/feed.

// Контекст свайпа строкой: "self" или "pick:<requestId>".
export const contextKey = (context: SwipeContext): string =>
  context.kind === "self" ? "self" : `pick:${context.requestId}`;

export const parseContextKey = (key: string | undefined): SwipeContext =>
  key?.startsWith("pick:")
    ? { kind: "pick", requestId: key.slice("pick:".length) }
    : { kind: "self" };

// Бюджет — пересечение диапазонов: товар «от 2 000 до 4 000» попадает в
// фильтр «до 3 000», потому что часть его офферов в бюджете.
export const matchesFilters = (product: Product, filters: ProductFilters) => {
  const { min, max } = filters.budget;
  if (product.priceMax < min) return false;
  if (max !== null && product.priceMin > max) return false;
  if (
    filters.categories.length > 0 &&
    !filters.categories.includes(product.category)
  ) {
    return false;
  }
  if (
    filters.marketplaces.length > 0 &&
    !product.offers.some((offer) =>
      filters.marketplaces.includes(offer.marketplace),
    )
  ) {
    return false;
  }
  return true;
};

// «Показывать подарки: всем» — все товары; «для неё» — all + female.
export const matchesAudience = (product: Product, audience: Audience) =>
  audience === "all" ||
  product.audience === "all" ||
  product.audience === audience;

const JITTER = 0.8;
// Не больше двух товаров одной категории подряд.
const MAX_IN_A_ROW = 2;

export const scoreProduct = (
  product: Product,
  interests: readonly string[],
  jitterSeed: string,
) =>
  2 * product.interests.filter((id) => interests.includes(id)).length +
  product.popularity +
  seededUnit(`${jitterSeed}:${product.id}`) * JITTER;

export const diversify = (products: Product[]): Product[] => {
  const pool = [...products];
  const result: Product[] = [];
  while (pool.length > 0) {
    const tail = result.slice(-MAX_IN_A_ROW);
    const blocked =
      tail.length === MAX_IN_A_ROW &&
      tail.every((p) => p.category === tail[0]?.category)
        ? tail[0]?.category
        : undefined;
    const index = pool.findIndex((product) => product.category !== blocked);
    const [next] = pool.splice(index === -1 ? 0 : index, 1);
    if (next) result.push(next);
  }
  return result;
};

export type RankInput = {
  audience: Audience;
  // "YYYY-MM-DD": разброс считается от userId + даты, чтобы лента не прыгала
  // при перезагрузке, но обновлялась день ото дня.
  dateKey: string;
  excludeIds: ReadonlySet<string>;
  filters: ProductFilters;
  interests: readonly string[];
  products: Product[];
  userId: string;
};

export const rankProducts = ({
  products,
  filters,
  audience,
  interests,
  excludeIds,
  userId,
  dateKey,
}: RankInput): Product[] => {
  const jitterSeed = `${userId}:${dateKey}`;
  const scored = products
    .filter(
      (product) =>
        !excludeIds.has(product.id) &&
        matchesFilters(product, filters) &&
        matchesAudience(product, audience),
    )
    .map((product) => ({
      product,
      score: scoreProduct(product, interests, jitterSeed),
    }))
    .sort((a, b) => b.score - a.score)
    .map(({ product }) => product);
  return diversify(scored);
};
