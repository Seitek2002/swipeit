import {
  ActivitiesQuerySchema,
  parsePlanFiltersParam,
} from "@swipeit/core/api/catalog/query";
import { matchesPlanFilters } from "@swipeit/core/logic/activities";
import { nanoid } from "nanoid";

import type { Activity } from "../../catalog/types";
import { CustomActivityInputSchema } from "../../plans/types";
import type { Handler } from "../context";
import { parseInput, requireUser } from "./common";

// Занятия для «Че делать будем?» (TECH_SPEC §5, §6): каталог Товароведа
// (только чтение) и свои занятия пользователей в db.customActivities.

// Фильтр занятий и разбор query — общие с сервером (@swipeit/core,
// BACKEND.md B06).
export { matchesPlanFilters };

// GET /activities?filters — занятия каталога (по фильтрам плана, если они
// заданы). Расширение TECH_SPEC §6: счётчик на шаге 3 создания плана и
// страница «Авторы фото» (названия и миниатюры к записям meta.json).
export const listActivities: Handler = async (ctx, { query }) => {
  const input = parseInput(ActivitiesQuerySchema, query);
  const filters = parsePlanFiltersParam(input.filters);
  const activities = await ctx.catalog.activities();
  return filters
    ? activities.filter((activity) => matchesPlanFilters(activity, filters))
    : activities;
};

// POST /activities — «+ Своё занятие». Живёт в базе отдельно от плана:
// форма создаёт его до того, как план сохранён, а POST /plans ссылается
// на него по id.
export const createCustomActivity: Handler = async (ctx, { body }) => {
  const input = parseInput(CustomActivityInputSchema, body);
  const min = input.pricePerPersonMin ?? input.pricePerPersonMax ?? 0;
  const activity = await ctx.db.write((db): Activity => {
    const user = requireUser(ctx, db);
    const created: Activity = {
      id: `ca_${nanoid(10)}`,
      title: input.title,
      description: input.description,
      category: input.category,
      tags: [],
      pricePerPersonMin: min,
      pricePerPersonMax: input.pricePerPersonMax ?? min,
      // Длительность в форме не спрашиваем: 0 — «не указано».
      durationMin: 0,
      durationMax: 0,
      seasons: [],
      groupSize: { min: 1, max: null },
      place: input.place || undefined,
      imageKey: input.imageKey,
      isCustom: true,
      createdBy: user.id,
    };
    db.customActivities[created.id] = created;
    return created;
  });
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["plans"],
    id: activity.id,
    by: ctx.userId ?? "",
  });
  return activity;
};
