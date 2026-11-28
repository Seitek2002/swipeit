import { type Audience, type CategoryId, shopHost } from "../config/index";

import type { Product, ProductFilters } from "../api/catalog/types";
import type { Taste } from "../api/users/types";
import type { SwipeContext } from "../api/wishlist/types";
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

// «Показывать подарки: всем» — все товары; «для неё» — all + female.
export const matchesAudience = (product: Product, audience: Audience) =>
  audience === "all" ||
  product.audience === "all" ||
  product.audience === audience;

// Бюджет — пересечение диапазонов: товар «от 2 000 до 4 000» попадает в
// фильтр «до 3 000», потому что часть его офферов в бюджете. Аудитория из
// фильтров (нет поля — «всем»): старые ссылки-фильтры без неё открываются.
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
  // Магазины: свой маркетплейс или «другой» по домену ссылки (shops). Старый
  // выбор «Другой магазин» (marketplaces: other) — любой «другой».
  const shops = filters.shops ?? [];
  if (
    (filters.marketplaces.length > 0 || shops.length > 0) &&
    !product.offers.some((offer) =>
      offer.marketplace === "other"
        ? filters.marketplaces.includes("other") ||
          shops.includes(shopHost(offer.url) ?? "")
        : filters.marketplaces.includes(offer.marketplace),
    )
  ) {
    return false;
  }
  return matchesAudience(product, filters.audience ?? "all");
};

export const PAGE_SIZE = 10;
// Разведка в каждой порции: 2 места из 10 — категориям, которые ещё не
// пробовали, чтобы лента не замкнулась на первых лайках.
const EXPLORE_SLOTS = 2;
const UNTRIED_BELOW = 1;
// Категория, которую человек любит: набрала от 1 (хотя бы одно «Хочу»
// перевешивает «Мимо»).
const LIKED_FROM = 1;
// Не больше двух товаров одной категории подряд (п. 5).
const MAX_IN_A_ROW = 2;
const JITTER = 0.8;
// Лента сдвигается к аудитории, когда «Хочу» с полом набралось от 4 и одна
// сторона взяла от 75%.
const SHIFT_MIN_LIKES = 4;
const SHIFT_SHARE = 0.75;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Что лента знает о пользователе.
export type FeedProfile = {
  // Выбраны самим в профиле.
  interests: readonly string[];
  // «Не моё».
  mutedInterests?: readonly string[];
  taste?: null | Taste;
};

// К какой аудитории сдвинута лента: только при «всем» в фильтрах — если
// человек сам выбрал «для неё», сдвигать нечего.
export const audienceShift = (
  taste: null | Taste | undefined,
  filterAudience: Audience | undefined,
): "female" | "male" | null => {
  if ((filterAudience ?? "all") !== "all" || !taste) return null;
  const { female, male } = taste.audience;
  const total = female + male;
  if (total < SHIFT_MIN_LIKES) return null;
  if (female / total >= SHIFT_SHARE) return "female";
  if (male / total >= SHIFT_SHARE) return "male";
  return null;
};

const hasMuted = (product: Product, muted: ReadonlySet<string>) =>
  product.interests.some((id) => muted.has(id));

// Оценка товара (TECH_SPEC §6, п. 3). Вес «Не моё» в сумму вкуса не идёт:
// интерес, который человек отверг, не должен поднимать товар обратно,
// даже если раньше его лайкали.
export const scoreProduct = (
  product: Product,
  profile: FeedProfile,
  shift: "female" | "male" | null,
  jitterSeed: string,
) => {
  const own = new Set(profile.interests);
  const muted = new Set(profile.mutedInterests ?? []);
  const taste = profile.taste;
  const interests = [...new Set(product.interests)];
  const tasteSum = interests
    .filter((id) => !muted.has(id))
    .reduce((sum, id) => sum + (taste?.interests[id] ?? 0), 0);
  const categoryWeight = taste?.categories[product.category] ?? 0;
  const otherSide =
    shift !== null && product.audience !== "all" && product.audience !== shift;
  return (
    2 * interests.filter((id) => own.has(id)).length +
    clamp(tasteSum / 3, -1.5, 2.5) +
    clamp(categoryWeight / 4, -0.5, 1) -
    2 * interests.filter((id) => muted.has(id)).length -
    (otherSide ? 1 : 0) +
    product.popularity +
    seededUnit(`${jitterSeed}:${product.id}`) * JITTER
  );
};

// Ещё не пробовали: вес категории по модулю меньше 1.
export const isUntriedCategory = (
  category: CategoryId,
  taste: null | Taste | undefined,
) => Math.abs(taste?.categories[category] ?? 0) < UNTRIED_BELOW;

// Порция из ранжированного списка (п. 4–5): 2 места из 10 — разведке и не
// больше 2 карточек одной категории подряд. Вторая подряд — только если
// другой любимой категории под рукой нет: «техника, игры, техника, игры»,
// а не «техника, техника, игры, игры». Когда оставшиеся места нужны
// разведке — лучшая из неиспробованных категорий.
const takePage = (
  pool: Product[],
  tail: readonly CategoryId[],
  isUntried: (product: Product) => boolean,
  isLiked: (category: CategoryId) => boolean,
  isMuted: (product: Product) => boolean,
): Product[] => {
  const page: Product[] = [];
  const recent = [...tail];
  let explored = 0;
  const exploreNeeded = Math.min(EXPLORE_SLOTS, pool.filter(isUntried).length);
  while (page.length < PAGE_SIZE && pool.length > 0) {
    const mustExplore = exploreNeeded - explored >= PAGE_SIZE - page.length;
    const allowed = (product: Product) => !mustExplore || isUntried(product);
    const previous = recent.at(-1);
    const run = recent
      .slice(-MAX_IN_A_ROW)
      .filter((category) => category === previous).length;
    const fits = (product: Product) =>
      allowed(product) &&
      !(run >= MAX_IN_A_ROW && product.category === previous);
    // «Не моё» — только когда других кандидатов нет совсем: даже третий
    // подряд товар одной категории лучше приглушённого (TECH_SPEC §6, T23).
    const clean = (product: Product) => fits(product) && !isMuted(product);
    let index = pool.findIndex(clean);
    if (index !== -1 && previous && pool[index]?.category === previous) {
      // Повтор уступает другой любимой категории, а на местах разведки —
      // любой другой: две разведочные карточки — это две разные категории.
      const other = (product: Product) =>
        clean(product) &&
        product.category !== previous &&
        (isLiked(product.category) || mustExplore);
      const alternative = pool.findIndex(other);
      if (alternative !== -1) index = alternative;
    }
    // Остались только карточки той же категории — лучше показать их, чем
    // оборвать ленту.
    if (index === -1) {
      index = pool.findIndex(
        (product) => allowed(product) && !isMuted(product),
      );
    }
    if (index === -1) index = pool.findIndex(fits);
    if (index === -1) index = pool.findIndex(allowed);
    if (index === -1) index = 0;
    const [next] = pool.splice(index, 1);
    if (!next) break;
    if (isUntried(next)) explored += 1;
    page.push(next);
    recent.push(next.category);
  }
  return page;
};

// Первая порция-разведка (п. 2): нового человека ещё не знаем, поэтому по
// одному товару из 10 разных категорий — самый популярный в категории, в
// первую очередь «для всех». Так вкус узнаётся быстрее всего.
// Обучающая карточка (guide) занимает место своей категории и идёт первой.
const explorePage = (
  ranked: Product[],
  jitterSeed: string,
  muted: ReadonlySet<string>,
  guide: Product | undefined,
): Product[] => {
  const best = new Map<CategoryId, Product>();
  const better = (a: Product, b: Product) => {
    if ((a.audience === "all") !== (b.audience === "all")) {
      return a.audience === "all";
    }
    if (hasMuted(a, muted) !== hasMuted(b, muted)) return !hasMuted(a, muted);
    return a.popularity > b.popularity;
  };
  for (const product of ranked) {
    const current = best.get(product.category);
    if (!current || better(product, current)) {
      best.set(product.category, product);
    }
  }
  if (guide) best.set(guide.category, guide);
  const order = (product: Product) =>
    product === guide
      ? Number.POSITIVE_INFINITY
      : product.popularity + seededUnit(`${jitterSeed}:${product.id}`) * JITTER;
  return [...best.values()]
    .sort((a, b) => order(b) - order(a))
    .slice(0, PAGE_SIZE);
};

export type RankInput = {
  // "YYYY-MM-DD": разброс считается от userId + даты, чтобы лента не прыгала
  // при перезагрузке, но обновлялась день ото дня.
  dateKey: string;
  // Уже свайпнутые в этом контексте и те, что уже лежат в колоде клиента:
  // выданная колода не перемешивается — новый вкус влияет только на
  // следующие порции.
  excludeIds: ReadonlySet<string>;
  // Первая порция-разведка: в self ещё нет ни одного свайпа.
  explore: boolean;
  filters: ProductFilters;
  // Обучающая карточка (п. 2): этот товар первым, если он ещё не свайпнут и
  // не лежит в колоде. Фильтры его не убирают (UX-аудит Y03): это подсказка,
  // а не товар, — пришедший из Санты с бюджетом «до 2 000» тоже её увидит.
  // Обработчик передаёт id, пока deck_guide не отмечена в своей ленте; в
  // ленте по ссылке-фильтру — нет.
  guideId?: string;
  products: readonly Product[];
  profile: FeedProfile;
  userId: string;
};

// Вся лента по порядку: порции по 10 подряд. Обработчик отдаёт первые
// limit, счётчик «Показать N подарков» — длину.
export const rankProducts = ({
  products,
  filters,
  profile,
  excludeIds,
  explore,
  guideId,
  userId,
  dateKey,
}: RankInput): Product[] => {
  const jitterSeed = `${userId}:${dateKey}`;
  const muted = new Set(profile.mutedInterests ?? []);
  const shift = audienceShift(profile.taste, filters.audience);
  // «Не моё» лента опускает: такие товары — только когда других кандидатов
  // нет (иначе вкус, набранный до «Не моё», поднимал бы их обратно).
  const ranked = products
    .filter(
      (product) =>
        !excludeIds.has(product.id) && matchesFilters(product, filters),
    )
    .map((product) => ({
      product,
      muted: hasMuted(product, muted),
      score: scoreProduct(product, profile, shift, jitterSeed),
    }))
    .sort((a, b) =>
      a.muted === b.muted
        ? b.score - a.score || a.product.id.localeCompare(b.product.id)
        : a.muted
          ? 1
          : -1,
    )
    .map(({ product }) => product);

  // Свайпнут или лежит в колоде — лента как раньше. Фильтры — не помеха
  // (Y03): берём из всего каталога.
  const guide = guideId
    ? products.find(
        (product) => product.id === guideId && !excludeIds.has(product.id),
      )
    : undefined;
  const result: Product[] = explore
    ? explorePage(ranked, jitterSeed, muted, guide)
    : guide
      ? [guide]
      : [];
  const used = new Set(result.map((product) => product.id));
  const pool = ranked.filter((product) => !used.has(product.id));
  const isUntried = (product: Product) =>
    !hasMuted(product, muted) &&
    isUntriedCategory(product.category, profile.taste);
  const isLiked = (category: CategoryId) =>
    (profile.taste?.categories[category] ?? 0) >= LIKED_FROM;
  while (pool.length > 0) {
    result.push(
      ...takePage(
        pool,
        result.slice(-MAX_IN_A_ROW).map((product) => product.category),
        isUntried,
        isLiked,
        (product) => hasMuted(product, muted),
      ),
    );
  }
  return result;
};
