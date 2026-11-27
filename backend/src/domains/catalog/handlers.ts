import {
  ActivitiesQuerySchema,
  FEED_DEFAULT_LIMIT,
  type FeedQuery,
  FeedQuerySchema,
  parseExcludeParam,
  parsePlanFiltersParam,
  parseProductFiltersParam,
} from "@swipeit/core/api/catalog/query";
import type { FeedResponse } from "@swipeit/core/api/catalog/types";
import { GUIDE_PRODUCT_ID } from "@swipeit/core/config";
import { notFound } from "@swipeit/core/errors";
import { toDateKey } from "@swipeit/core/format";
import { matchesPlanFilters } from "@swipeit/core/logic/activities";
import { catalogStores } from "@swipeit/core/logic/catalog-stores";
import {
  contextKey,
  parseContextKey,
  rankProducts,
} from "@swipeit/core/logic/feed";
import { tasteOf } from "@swipeit/core/logic/taste";
import { parseInput } from "@swipeit/core/parse-input";

import type { ServerContext, ServerHandler } from "../../context";
import { readMe, rowToUser } from "../users/queries";
import { swipesOf } from "../swipes/queries";

// Каталог и лента (BACKEND.md B06): каталог — в памяти (§8), лента — тот же
// rankProducts из core, что у мока, с той же историей свайпов из базы.

const rankForUser = async (ctx: ServerContext, query: FeedQuery) => {
  const user = rowToUser(await readMe(ctx));
  const { products, productsById } = ctx.catalog;
  const context = parseContextKey(query.context);
  const key = contextKey(context);
  const own = await swipesOf(ctx.tx, user.id);
  const swiped = own
    .filter((swipe) => contextKey(swipe.context) === key)
    .map((swipe) => swipe.productId);
  return rankProducts({
    products,
    // Аудитория — из фильтров, а не из профиля (как в моке).
    filters: parseProductFiltersParam(query.filters),
    profile: {
      interests: user.interests,
      mutedInterests: user.mutedInterests,
      taste: tasteOf(user, own, productsById),
    },
    excludeIds: new Set([...swiped, ...parseExcludeParam(query.exclude)]),
    // Разведка — только в своей ленте и пока в ней нет ни одного свайпа.
    explore:
      context.kind === "self" &&
      !own.some((swipe) => swipe.context.kind === "self"),
    // Обучающая карточка — в своей ленте, пока подсказка не отмечена.
    guideId:
      context.kind === "self" && !(user.seenHints ?? []).includes("deck_guide")
        ? GUIDE_PRODUCT_ID
        : undefined,
    userId: user.id,
    dateKey: toDateKey(ctx.clock.now()),
  });
};

// GET /catalog/feed — следующая порция ленты.
export const getFeed: ServerHandler = async (ctx, { query }) => {
  const input = parseInput(FeedQuerySchema, query);
  const ranked = await rankForUser(ctx, input);
  const response: FeedResponse = {
    items: ranked.slice(0, input.limit ?? FEED_DEFAULT_LIMIT),
    total: ranked.length,
  };
  return response;
};

// GET /catalog/count — «Показать 84 подарка».
export const getCount: ServerHandler = async (ctx, { query }) => {
  const input = parseInput(FeedQuerySchema, { ...query, exclude: undefined });
  return { count: (await rankForUser(ctx, input)).length };
};

export const getProduct: ServerHandler = async (ctx, { params }) => {
  const product = ctx.catalog.productsById.get(params.id ?? "");
  if (!product) throw notFound("Товар не найден");
  return product;
};

// Магазины для фильтра — один раз на каталог: он не меняется до перезапуска.
let storesCache: null | {
  stores: ReturnType<typeof catalogStores>;
  version: string;
} = null;
export const getCatalogStores: ServerHandler = async (ctx) => {
  if (storesCache?.version !== ctx.catalog.version) {
    storesCache = {
      version: ctx.catalog.version,
      stores: catalogStores(ctx.catalog.products),
    };
  }
  return storesCache.stores;
};

// GET /catalog/meta — курсы и авторы фото занятий.
export const getCatalogMeta: ServerHandler = async (ctx) => {
  if (!ctx.catalog.meta) throw notFound("Нет данных каталога");
  return ctx.catalog.meta;
};

// GET /activities?filters — занятия каталога (по фильтрам плана, если есть).
export const listActivities: ServerHandler = async (ctx, { query }) => {
  const input = parseInput(ActivitiesQuerySchema, query);
  const filters = parsePlanFiltersParam(input.filters);
  const { activities } = ctx.catalog;
  return filters
    ? activities.filter((activity) => matchesPlanFilters(activity, filters))
    : activities;
};
