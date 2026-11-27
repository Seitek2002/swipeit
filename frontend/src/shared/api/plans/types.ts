import { z } from "zod";

import { ACTIVITY_CATEGORY_IDS } from "@/shared/config";

import type { Activity } from "../catalog/types";
import type { User } from "../users/types";

// Фильтры колоды плана: категории (пусто — все) и бюджет на человека
// (max = null — без верхней границы). Шаг 3 создания плана, DESIGN.md §8.7.
export const PlanFiltersSchema = z.object({
  categories: z.array(z.enum(ACTIVITY_CATEGORY_IDS)),
  budgetPerPerson: z.object({
    min: z.number().nonnegative(),
    max: z.number().nonnegative().nullable(),
  }),
});

// «Че делать будем?» (TECH_SPEC §5).
export const PlanSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerId: z.string(),
  mode: z.enum(["live", "deadline"]),
  deadline: z.string().optional(),
  status: z.enum(["lobby", "swiping", "results", "decided"]),
  // Включая владельца.
  participantIds: z.array(z.string()),
  // Для лобби в режиме live. Организатор готов с момента создания: он сам
  // жмёт «Поехали».
  readyIds: z.array(z.string()),
  matchRule: z.enum(["all", "majority"]),
  filters: PlanFiltersSchema,
  // Расширение TECH_SPEC §5: свои занятия плана (id из db.customActivities).
  // До старта колоды нет, а свои занятия попадают в неё в обход фильтров.
  // default — чтобы планы, сохранённые без поля, читались.
  customActivityIds: z.array(z.string()).default([]),
  // Порядок одинаковый для всех — перемешан один раз при старте.
  deck: z.array(z.string()),
  swipes: z.record(z.string(), z.record(z.string(), z.enum(["like", "pass"]))),
  finishedIds: z.array(z.string()),
  votes: z.record(z.string(), z.string()),
  decision: z
    .object({
      activityId: z.string(),
      method: z.enum(["random", "vote", "owner"]),
      decidedAt: z.string(),
      scheduledFor: z.string().optional(),
    })
    .optional(),
  createdAt: z.string(),
});

// Тело POST /plans. Общая схема для формы создания и обработчика.
export const CreatePlanInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Напиши название")
      .max(60, "Название — до 60 символов"),
    mode: z.enum(["live", "deadline"]),
    // Только для mode: "deadline" — ISO-строка.
    deadline: z.iso.datetime({ offset: true }).optional(),
    // Кого позвал организатор: друзья (люди и демо-боты). Сам организатор
    // добавляется автоматически.
    participantIds: z.array(z.string().min(1)).max(30, "Не больше 30 человек"),
    matchRule: z.enum(["all", "majority"]).default("all"),
    filters: PlanFiltersSchema,
    // Свои занятия, созданные через POST /activities.
    customActivityIds: z.array(z.string().min(1)).max(20).default([]),
  })
  .refine((input) => input.mode === "live" || Boolean(input.deadline), {
    message: "Выбери дату и время",
    path: ["deadline"],
  });

// Тело POST /activities — «+ Своё занятие»: название, описание, цена,
// фото — необязательно (DESIGN.md §8.7). Остальные поля Activity сервер
// заполняет сам.
export const CustomActivityInputSchema = z
  .object({
    title: z
      .string()
      .trim()
      .min(1, "Напиши, что будем делать")
      .max(60, "Название — до 60 символов"),
    description: z
      .string()
      .trim()
      .max(300, "Описание — до 300 символов")
      .default(""),
    // В форме категории нет — по умолчанию «Отдых». На фильтры плана не
    // влияет: свои занятия попадают в колоду всегда.
    category: z.enum(ACTIVITY_CATEGORY_IDS).default("chill"),
    pricePerPersonMin: z.number().int().nonnegative().optional(),
    pricePerPersonMax: z.number().int().nonnegative().optional(),
    place: z.string().trim().max(60).optional(),
    // Ключ фото в IndexedDB (local) или на LAN-сервере (lan).
    imageKey: z.string().min(1).optional(),
  })
  .refine(
    (input) =>
      input.pricePerPersonMin === undefined ||
      input.pricePerPersonMax === undefined ||
      input.pricePerPersonMin <= input.pricePerPersonMax,
    { message: "Цена «от» больше цены «до»", path: ["pricePerPersonMax"] },
  );

export type PlanFilters = z.infer<typeof PlanFiltersSchema>;
export type PlanSession = z.infer<typeof PlanSessionSchema>;
export type CreatePlanInput = z.input<typeof CreatePlanInputSchema>;
export type CustomActivityInput = z.input<typeof CustomActivityInputSchema>;

// Участник в ответах API — сразу с именем и цветом, чтобы экран не
// дозапрашивал профили по одному.
export type PlanParticipant = Pick<
  User,
  "avatarColor" | "id" | "isBot" | "name"
>;

// GET /plans/:id и ответы действий лобби. activities — колода в общем
// порядке, когда она сформирована; до старта — занятия, из которых она
// будет собрана (свои сначала, потом каталог по фильтрам, без перемешивания).
export type PlanView = {
  activities: Activity[];
  participants: PlanParticipant[];
  plan: PlanSession;
};

// Элемент GET /plans — билетик-превью в списке планов.
export type PlanSummary = {
  // Сколько занятий в колоде (или будет в ней после старта).
  activityCount: number;
  participants: PlanParticipant[];
  plan: PlanSession;
  // До 3 занятий для превью; у решённого плана первым идёт решение.
  preview: Activity[];
};

// Тело POST /plans/:id/decide. scheduledFor — когда идём (ISO); без него
// экран и .ics берут ближайшую субботу 12:00.
export type DecidePlanInput =
  | { activityId: string; method: "owner" | "vote"; scheduledFor?: string }
  | { method: "random"; scheduledFor?: string };
