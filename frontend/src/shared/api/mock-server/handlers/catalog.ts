import { z } from "zod";

import { GUIDE_PRODUCT_ID } from "@/shared/config";
import { toDateKey } from "@/shared/lib/format";

import { EMPTY_FILTERS } from "../../catalog/constants";
import {
  type FeedResponse,
  type ProductFilters,
  ProductFiltersSchema,
} from "../../catalog/types";
import type { Handler, HandlerContext } from "../context";
import type { Db } from "../db";
import { notFound, validation } from "../errors";
import { contextKey, parseContextKey, rankProducts } from "../feed";
import { tasteOf } from "../taste";
import { parseInput, requireUser } from "./common";

const DEFAULT_LIMIT = 10;

// Параметры в query — строки (в lan они приходят из URL), поэтому фильтры —
// JSON-строкой, список исключений — через запятую.
const FeedQuerySchema = z.object({
  filters: z.string().optional(),
  context: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  // Карточки, которые уже лежат в колоде клиента, но ещё не свайпнуты:
  // без них дозапрос вернул бы их повторно.
  exclude: z.string().optional(),
});

const parseFilters = (raw: string | undefined): ProductFilters => {
  if (!raw) return EMPTY_FILTERS;
  try {
    return ProductFiltersSchema.parse(JSON.parse(raw));
  } catch {
    throw validation("Фильтры повреждены");
  }
};

const rankForUser = async (
  ctx: HandlerContext,
  db: Db,
  query: z.infer<typeof FeedQuerySchema>,
) => {
  const user = requireUser(ctx, db);
  const products = await ctx.catalog.products();
  const context = parseContextKey(query.context);
  const key = contextKey(context);
  const own = db.productSwipes.filter((swipe) => swipe.userId === user.id);
  const swiped = own
    .filter((swipe) => contextKey(swipe.context) === key)
    .map((swipe) => swipe.productId);
  const extra = query.exclude ? query.exclude.split(",").filter(Boolean) : [];
  return rankProducts({
    products,
    // Аудитория — из фильтров (TECH_SPEC §5 ProductFilters.audience), а не
    // из профиля: User.audience устарело с этапа 7.
    filters: parseFilters(query.filters),
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
    items: ranked.slice(0, input.limit ?? DEFAULT_LIMIT),
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

// GET /catalog/meta — meta.json: курсы и авторы фото занятий (страница
// «Авторы фото»). Пользователь не нужен: страница открывается и до
// онбординга.
export const getCatalogMeta: Handler = async (ctx) => ctx.catalog.meta();
