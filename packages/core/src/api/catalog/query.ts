import { z } from "zod";

import { validation } from "../../errors";
import { type PlanFilters, PlanFiltersSchema } from "../plans/types";
import { EMPTY_FILTERS } from "./constants";
import { type ProductFilters, ProductFiltersSchema } from "./types";

// Параметры ленты и занятий в query — строки (в lan и на сервере они приходят
// из URL), поэтому фильтры — JSON-строкой, список исключений — через запятую.
// Общие для мока и сервера (BACKEND.md B06).

export const FeedQuerySchema = z.object({
  filters: z.string().optional(),
  context: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  // Карточки, которые уже лежат в колоде клиента, но ещё не свайпнуты:
  // без них дозапрос вернул бы их повторно.
  exclude: z.string().optional(),
});
export type FeedQuery = z.infer<typeof FeedQuerySchema>;

export const FEED_DEFAULT_LIMIT = 10;

export const parseProductFiltersParam = (
  raw: string | undefined,
): ProductFilters => {
  if (!raw) return EMPTY_FILTERS;
  try {
    return ProductFiltersSchema.parse(JSON.parse(raw));
  } catch {
    throw validation("Фильтры повреждены");
  }
};

export const parseExcludeParam = (raw: string | undefined): string[] =>
  raw ? raw.split(",").filter(Boolean) : [];

export const ActivitiesQuerySchema = z.object({
  filters: z.string().optional(),
});

export const parsePlanFiltersParam = (
  raw: string | undefined,
): null | PlanFilters => {
  if (!raw) return null;
  try {
    return PlanFiltersSchema.parse(JSON.parse(raw));
  } catch {
    throw validation("Фильтры повреждены");
  }
};
