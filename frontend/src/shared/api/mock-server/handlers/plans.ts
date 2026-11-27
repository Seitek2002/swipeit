import { nanoid } from "nanoid";
import { z } from "zod";

import type { BotTrigger } from "@/shared/lib/realtime/types";

import type { Activity } from "../../catalog/types";
import {
  CreatePlanInputSchema,
  type PlanParticipant,
  type PlanSession,
  type PlanSummary,
  type PlanView,
} from "../../plans/types";
import type { User } from "../../users/types";
import { type Handler, type HandlerContext, nowIso } from "../context";
import type { Db } from "../db";
import { ApiError, notFound, validation } from "../errors";
import { matchesPlanFilters } from "./activities";
import { parseInput, requireUser } from "./common";

// «Че делать будем?» — список, создание, вступление и лобби (TECH_SPEC §5,
// §6; DESIGN.md §8.7). Свайп колоды, совпадения и решение — T14/T15.

// Сколько готовых нужно, чтобы организатор мог нажать «Поехали».
const MIN_READY = 2;
const PREVIEW_SIZE = 3;

const ReadyBodySchema = z.object({ ready: z.boolean().default(true) });

const forbidden = (message: string) => new ApiError(403, "FORBIDDEN", message);
const conflict = (message: string) => new ApiError(409, "CONFLICT", message);

const findPlan = (db: Db, id: string | undefined): PlanSession => {
  const plan = db.plans[id ?? ""];
  if (!plan) throw notFound("План не найден");
  return plan;
};

const requireParticipant = (plan: PlanSession, user: User) => {
  if (!plan.participantIds.includes(user.id)) {
    throw forbidden("Сначала присоединись к плану");
  }
};

// Как в GET /friends: в lan все люди сервера — друзья друг другу и ботам
// (TECH_SPEC §7a), в local — только связи из db.friends.
const isFriend = (ctx: HandlerContext, db: Db, me: string, other: string) =>
  ctx.mode === "lan" || (db.friends[me] ?? []).includes(other);

const participantsOf = (db: Db, plan: PlanSession): PlanParticipant[] =>
  plan.participantIds
    .map((id) => db.users[id])
    .filter((user): user is User => Boolean(user))
    .map(({ id, name, avatarColor, isBot }) => ({
      id,
      name,
      avatarColor,
      isBot,
    }));

const customOf = (db: Db, plan: PlanSession): Activity[] =>
  plan.customActivityIds
    .map((id) => db.customActivities[id])
    .filter((activity): activity is Activity => Boolean(activity));

// Из чего собирается колода: свои занятия (в обход фильтров — их добавили
// специально) и каталог по фильтрам плана.
const poolOf = (db: Db, plan: PlanSession, catalog: Activity[]): Activity[] => [
  ...customOf(db, plan),
  ...catalog.filter((activity) => matchesPlanFilters(activity, plan.filters)),
];

// Колода в общем порядке. Занятие могло пропасть из каталога после
// обновления — тогда его просто нет в выдаче, порядок остальных тот же.
const deckOf = (db: Db, plan: PlanSession, catalog: Activity[]): Activity[] => {
  const byId = new Map<string, Activity>(
    [...catalog, ...customOf(db, plan)].map((activity) => [
      activity.id,
      activity,
    ]),
  );
  return plan.deck
    .map((id) => byId.get(id))
    .filter((activity): activity is Activity => Boolean(activity));
};

const activitiesOf = (db: Db, plan: PlanSession, catalog: Activity[]) =>
  plan.deck.length > 0 ? deckOf(db, plan, catalog) : poolOf(db, plan, catalog);

const viewOf = (db: Db, plan: PlanSession, catalog: Activity[]): PlanView => ({
  plan,
  participants: participantsOf(db, plan),
  activities: activitiesOf(db, plan, catalog),
});

const summaryOf = (
  db: Db,
  plan: PlanSession,
  catalog: Activity[],
): PlanSummary => {
  const activities = activitiesOf(db, plan, catalog);
  const decided = plan.decision
    ? activities.find((activity) => activity.id === plan.decision?.activityId)
    : undefined;
  const preview = decided
    ? [decided, ...activities.filter((activity) => activity !== decided)]
    : activities;
  return {
    plan,
    participants: participantsOf(db, plan),
    preview: preview.slice(0, PREVIEW_SIZE),
    activityCount: activities.length,
  };
};

const changed = (ctx: HandlerContext, planId: string) =>
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["plans"],
    id: planId,
    by: ctx.userId ?? "",
  });

// Триггер для ботов (TECH_SPEC §7): id — план, by — кто сделал.
const trigger = (ctx: HandlerContext, name: BotTrigger, planId: string) =>
  ctx.realtime.publish({
    type: "trigger",
    name,
    id: planId,
    by: ctx.userId ?? "",
  });

const unique = (ids: string[]) => [...new Set(ids)];

// GET /plans — мои планы (организую или участвую), новые сверху.
export const listPlans: Handler = async (ctx) => {
  const catalog = await ctx.catalog.activities();
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  // reverse — при равном времени (перемотка часов, быстрые клики) новее
  // тот, что добавлен в базу позже; sort стабильный.
  return Object.values(db.plans)
    .reverse()
    .filter((plan) => plan.participantIds.includes(user.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((plan) => summaryOf(db, plan, catalog));
};

// GET /plans/:id — план с участниками и занятиями. Открыть может любой
// пользователь: экран приглашения /plans/join/?id= показывает план до
// вступления.
export const getPlan: Handler = async (ctx, { params }) => {
  const catalog = await ctx.catalog.activities();
  const db = await ctx.db.read();
  requireUser(ctx, db);
  return viewOf(db, findPlan(db, params.id), catalog);
};

// POST /plans — новый план. «Прямо сейчас» начинается с лобби; «До даты»
// лобби не имеет (DESIGN.md §8.7): колода собирается сразу и план
// стартует в момент создания.
export const createPlan: Handler = async (ctx, { body }) => {
  const input = parseInput(CreatePlanInputSchema, body);
  if (
    input.mode === "deadline" &&
    Date.parse(input.deadline ?? "") <= ctx.clock.now()
  ) {
    throw validation("Эта дата уже прошла");
  }
  const catalog = await ctx.catalog.activities();
  const view = await ctx.db.write((db): PlanView => {
    const owner = requireUser(ctx, db);
    const invited = unique(input.participantIds).filter(
      (id) => id !== owner.id,
    );
    for (const id of invited) {
      if (!db.users[id]) throw validation("Такого друга нет");
      if (!isFriend(ctx, db, owner.id, id)) {
        throw validation(
          "Позвать можно только друзей — остальным отправь ссылку",
        );
      }
    }
    const customIds = unique(input.customActivityIds);
    for (const id of customIds) {
      if (db.customActivities[id]?.createdBy !== owner.id) {
        throw validation("Своё занятие не найдено — добавь его заново");
      }
    }
    const live = input.mode === "live";
    const plan: PlanSession = {
      id: `pl_${nanoid(10)}`,
      title: input.title,
      ownerId: owner.id,
      mode: input.mode,
      deadline: live ? undefined : input.deadline,
      status: live ? "lobby" : "swiping",
      participantIds: [owner.id, ...invited],
      readyIds: live ? [owner.id] : [],
      matchRule: input.matchRule,
      filters: input.filters,
      customActivityIds: customIds,
      deck: [],
      swipes: {},
      finishedIds: [],
      votes: {},
      createdAt: nowIso(ctx.clock),
    };
    const pool = poolOf(db, plan, catalog);
    if (pool.length === 0) {
      throw validation(
        "Под эти фильтры нет ни одного занятия — расширь бюджет или добавь своё",
      );
    }
    if (!live) plan.deck = ctx.random.shuffle(pool.map((a) => a.id));
    db.plans[plan.id] = plan;
    return viewOf(db, plan, catalog);
  });
  changed(ctx, view.plan.id);
  trigger(ctx, "plan:created", view.plan.id);
  if (view.plan.status === "swiping")
    trigger(ctx, "plan:started", view.plan.id);
  return view;
};

// POST /plans/:id/join — вступить по ссылке-приглашению /plans/join/?id=
// (TECH_SPEC §8). Расширение TECH_SPEC §6: в таблице маршрутов его нет, по
// образцу POST /santa/:id/join. Повторное вступление ничего не меняет.
export const joinPlan: Handler = async (ctx, { params }) => {
  const catalog = await ctx.catalog.activities();
  const { joined, view } = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    const already = plan.participantIds.includes(user.id);
    if (!already) {
      if (plan.status === "results" || plan.status === "decided") {
        throw conflict("Выбор уже закончился — вступить нельзя");
      }
      plan.participantIds.push(user.id);
    }
    return { joined: !already, view: viewOf(db, plan, catalog) };
  });
  if (joined) changed(ctx, view.plan.id);
  return view;
};

// POST /plans/:id/ready { ready?: boolean } — «Готов» в лобби (и снять
// отметку). Организатор готов всегда: он сам запускает план.
export const setReady: Handler = async (ctx, { params, body }) => {
  const { ready } = parseInput(ReadyBodySchema, body ?? {});
  const catalog = await ctx.catalog.activities();
  const view = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireParticipant(plan, user);
    if (plan.status !== "lobby") throw conflict("План уже начался");
    if (!ready && user.id === plan.ownerId) {
      throw validation("Организатор всегда готов");
    }
    const others = plan.readyIds.filter((id) => id !== user.id);
    plan.readyIds = ready ? [...others, user.id] : others;
    return viewOf(db, plan, catalog);
  });
  changed(ctx, view.plan.id);
  return view;
};

// POST /plans/:id/start — «Поехали»: только организатор, когда готовы
// хотя бы двое (TASKS T13). Колода — свои занятия + каталог по фильтрам,
// перемешанные один раз здесь, на сервере: порядок один для всех.
export const startPlan: Handler = async (ctx, { params }) => {
  const catalog = await ctx.catalog.activities();
  const view = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    if (plan.ownerId !== user.id) {
      throw forbidden("Запустить план может только организатор");
    }
    if (plan.status !== "lobby") throw conflict("План уже запущен");
    const ready = plan.readyIds.filter((id) =>
      plan.participantIds.includes(id),
    );
    if (ready.length < MIN_READY) {
      throw conflict("Подожди, пока будут готовы хотя бы двое");
    }
    const pool = poolOf(db, plan, catalog);
    if (pool.length === 0) {
      throw conflict("Под эти фильтры не осталось занятий — добавь своё");
    }
    plan.deck = ctx.random.shuffle(pool.map((activity) => activity.id));
    plan.status = "swiping";
    return viewOf(db, plan, catalog);
  });
  changed(ctx, view.plan.id);
  trigger(ctx, "plan:started", view.plan.id);
  return view;
};
