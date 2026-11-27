import {
  FEED_DEFAULT_LIMIT,
  type FeedQuery,
  FeedQuerySchema,
  parseExcludeParam,
  parseProductFiltersParam,
} from "@swipeit/core/api/catalog/query";
import { catalogStores } from "@swipeit/core/logic/catalog-stores";

import { GUIDE_PRODUCT_ID } from "@/shared/config";
import { toDateKey } from "@/shared/lib/format";

import type { FeedResponse } from "../../catalog/types";
import type { Handler, HandlerContext } from "../context";
import type { Db } from "../db";
import { notFound } from "../errors";
import { contextKey, parseContextKey, rankProducts } from "../feed";
import { tasteOf } from "../taste";
import { parseInput, requireUser } from "./common";

const rankForUser = async (ctx: HandlerContext, db: Db, query: FeedQuery) => {
  const user = requireUser(ctx, db);
  const products = await ctx.catalog.products();
  const context = parseContextKey(query.context);
  const key = contextKey(context);
  const own = db.productSwipes.filter((swipe) => swipe.userId === user.id);
  const swiped = own
    .filter((swipe) => contextKey(swipe.context) === key)
    .map((swipe) => swipe.productId);
  const extra = parseExcludeParam(query.exclude);
  return rankProducts({
    products,
    // Аудитория — из фильтров (TECH_SPEC §5 ProductFilters.audience), а не
    // из профиля: User.audience устарело с этапа 7.
    filters: parseProductFiltersParam(query.filters),
    profile: {
      interests: user.interests,
      mutedInterests: user.mutedInterests,
      taste: tasteOf(user, own, products),
    },
    excludeIds: new Set([...swiped, ...extra]),
    // Разведка — только в своей ленте и только пока в ней нет ни одного
    // свайпа: в ленте по ссылке-фильтру вкус не узнаём.
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
export const getFeed: Handler = async (ctx, { query }) => {
  const input = parseInput(FeedQuerySchema, query);
  const ranked = await rankForUser(ctx, await ctx.db.read(), input);
  const response: FeedResponse = {
    items: ranked.slice(0, input.limit ?? FEED_DEFAULT_LIMIT),
    total: ranked.length,
  };
  return response;
};

// GET /catalog/count — «Показать 84 подарка»: сколько карточек будет в колоде
// с этими фильтрами (уже свайпнутые не считаются).
export const getCount: Handler = async (ctx, { query }) => {
  const input = parseInput(FeedQuerySchema, { ...query, exclude: undefined });
  const ranked = await rankForUser(ctx, await ctx.db.read(), input);
  return { count: ranked.length };
};

export const getProduct: Handler = async (ctx, { params }) => {
  const product = (await ctx.catalog.products()).find(
    (p) => p.id === params.id,
  );
  if (!product) throw notFound("Товар не найден");
  return product;
};

// GET /catalog/stores — магазины, где есть товары (UX-аудит M1): чипы фильтра.
// Каталог в демо не меняется — считаем по нему, без пользователя.
export const getCatalogStores: Handler = async (ctx) =>
  catalogStores(await ctx.catalog.products());

// GET /catalog/meta — meta.json: курсы и авторы фото занятий (страница
// «Авторы фото»). Пользователь не нужен: страница открывается и до
// онбординга.
export const getCatalogMeta: Handler = async (ctx) => ctx.catalog.meta();
