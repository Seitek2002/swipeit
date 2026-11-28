import type { Activity } from "@swipeit/core/api/catalog/types";
import {
  CreatePlanInputSchema,
  CustomActivityInputSchema,
  type PlanSession,
} from "@swipeit/core/api/plans/types";
import {
  conflict,
  forbidden,
  nameRequired,
  validation,
} from "@swipeit/core/errors";
import {
  computeMatches,
  decisionCandidates,
  tallyVotes,
  voteCandidates,
} from "@swipeit/core/logic/matches";
import {
  allFinished,
  closeAtDeadline,
  EXTRA_ROUND_MS,
  extendDeadline,
  extendRefusal,
  finishedParticipants,
  MIN_FINISHED_TO_CLOSE,
} from "@swipeit/core/logic/plan-close";
import { resolveDeckSize } from "@swipeit/core/logic/plan-deck";
import { parseInput } from "@swipeit/core/parse-input";
import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import {
  nowIso,
  type ServerContext,
  type ServerHandler,
  type Tx,
} from "../../context";
import {
  customActivities,
  planParticipants,
  plans,
  uploads,
} from "../../db/schema";
import { areFriends, makeFriends } from "../friends/handlers";
import { reachPlanStep, reachStep } from "../funnel/steps";
import { readMe, readUser, type UserRow } from "../users/queries";
import {
  activitiesFor,
  deckOf,
  insertPlan,
  loadPlan,
  type PlanActivities,
  poolOf,
  readCustomActivities,
  savePlan,
  summaryOf,
  viewOf,
} from "./store";

// «Че делать будем?» на сервере (BACKEND.md B10) — те же правила, что у мока
// (frontend/src/shared/api/mock-server/handlers/plans.ts): лобби, колода,
// совпадения, результаты, решение. Каждая запись — под FOR UPDATE строки
// плана; барабан крутит сервер (ctx.random). Ботов нет — триггеров для них
// тоже (§7).

// Сколько готовых нужно, чтобы организатор мог нажать «Поехали».
const MIN_READY = 2;
// Сколько должны долистать, чтобы показать итоги без всех (P04), и сутки
// нового круга «До даты» — MIN_FINISHED_TO_CLOSE и EXTRA_ROUND_MS из
// core/logic/plan-close: те же, что у мока.

const ReadyBodySchema = z.object({ ready: z.boolean().default(true) });

const SwipeBodySchema = z.object({
  activityId: z.string().min(1, "Какое занятие?"),
  decision: z.enum(["like", "pass"]),
});

const UndoBodySchema = z.object({
  activityId: z.string().min(1, "Какое занятие?"),
});

const IsoDateSchema = z.iso.datetime({
  offset: true,
  error: "Дата повреждена",
});

const VoteBodySchema = z.object({
  // null — снять свой голос.
  activityId: z
    .string({ error: "За что голосуешь?" })
    .min(1, "За что голосуешь?")
    .nullable(),
});

const DecideBodySchema = z.object({
  method: z.enum(["random", "vote", "owner"], {
    error: "Как решаем: барабан, голосование или выбор организатора?",
  }),
  activityId: z.string().min(1).optional(),
  scheduledFor: IsoDateSchema.optional(),
});

const RuleBodySchema = z.object({
  matchRule: z.enum(["all", "majority"], { error: "Какое правило?" }),
});

const AddActivitiesBodySchema = z.object({
  activityIds: z
    .array(z.string().min(1))
    .min(1, "Выбери хотя бы одно занятие")
    .max(20, "Не больше 20 занятий за раз"),
  deadline: IsoDateSchema.optional(),
});

type DecideBody = z.infer<typeof DecideBodySchema>;

const unique = (ids: readonly string[]) => [...new Set(ids)];

// Участники увидят организатора и друг друга по имени (DESIGN §8.7).
const readNamedMe = async (ctx: ServerContext): Promise<UserRow> => {
  const me = await readMe(ctx);
  if (!me.name) throw nameRequired();
  return me;
};

const requireParticipant = (plan: PlanSession, user: UserRow) => {
  if (!plan.participantIds.includes(user.id)) {
    throw forbidden("Сначала присоединись к плану");
  }
};

const requireOwner = (plan: PlanSession, user: UserRow, message: string) => {
  if (plan.ownerId !== user.id) throw forbidden(message);
};

// Изменения плана — участникам и тому, кто сделал (вышедший тоже
// перечитает), §5.
const audienceOf = (ctx: ServerContext, plan: PlanSession) => [
  ...plan.participantIds,
  ctx.userId ?? "",
];

const changed = (ctx: ServerContext, plan: PlanSession) =>
  ctx.events.publish(
    { type: "db:changed", scope: ["plans"], id: plan.id },
    audienceOf(ctx, plan),
  );

const progressEvent = (
  ctx: ServerContext,
  plan: PlanSession,
  userId: string,
  progress: { done: number; total: number },
) =>
  ctx.events.publish(
    { type: "plan:progress", planId: plan.id, userId, ...progress },
    audienceOf(ctx, plan),
  );

// Действие над планом под блокировкой: загрузить, изменить копию, записать
// разницу. mutate возвращает что угодно — оно уходит в ответ обработчику.
const withPlan = async <T>(
  ctx: ServerContext,
  id: string,
  mutate: (plan: PlanSession, source: PlanActivities) => Promise<T> | T,
): Promise<{ result: T; source: PlanActivities; plan: PlanSession }> => {
  const before = await loadPlan(ctx.tx, id, { lock: true });
  const plan = structuredClone(before);
  const result = await mutate(
    plan,
    await activitiesFor(ctx.tx, plan, ctx.catalog.activities),
  );
  await savePlan(ctx.tx, before, plan, ctx.clock.now());
  // Свои занятия могли добавиться — источник колоды заново.
  const source = await activitiesFor(ctx.tx, plan, ctx.catalog.activities);
  return { result, source, plan };
};

// ── Список, просмотр, создание, вступление ──────────────────────────

// GET /plans — мои планы (организую или участвую), новые сверху.
export const listPlans: ServerHandler = async (ctx) => {
  const me = await readMe(ctx);
  const rows = await ctx.tx
    .select({ id: plans.id })
    .from(plans)
    .innerJoin(
      planParticipants,
      and(
        eq(planParticipants.planId, plans.id),
        eq(planParticipants.userId, me.id),
      ),
    )
    .orderBy(desc(plans.createdAt), desc(plans.seq));
  const result = [];
  for (const { id } of rows) {
    const plan = await loadPlan(ctx.tx, id, { lock: false });
    result.push(
      await summaryOf(
        ctx.tx,
        plan,
        await activitiesFor(ctx.tx, plan, ctx.catalog.activities),
      ),
    );
  }
  return result;
};

// Не участнику — превью для экрана приглашения: без свайпов и голосов
// (§4.4): кто что лайкнул, видят только участники.
const previewOf = (plan: PlanSession): PlanSession => ({
  ...plan,
  swipes: {},
  votes: {},
});

// GET /plans/:id — участнику план целиком, остальным — превью.
export const getPlan: ServerHandler = async (ctx, { params }) => {
  // Без профиля — гость по приглашению (X07): только превью.
  const me = ctx.userId ? await readMe(ctx) : null;
  const plan = await loadPlan(ctx.tx, params.id ?? "", { lock: false });
  const source = await activitiesFor(ctx.tx, plan, ctx.catalog.activities);
  const shown =
    me && plan.participantIds.includes(me.id) ? plan : previewOf(plan);
  return viewOf(ctx.tx, shown, source);
};

// POST /plans — «Прямо сейчас» начинается с лобби; «До даты» — сразу с
// колодой.
export const createPlan: ServerHandler = async (ctx, { body }) => {
  const input = parseInput(CreatePlanInputSchema, body);
  const now = ctx.clock.now();
  if (input.mode === "deadline" && Date.parse(input.deadline ?? "") <= now) {
    throw validation("Эта дата уже прошла");
  }
  const owner = await readNamedMe(ctx);
  const invited = unique(input.participantIds).filter((id) => id !== owner.id);
  for (const id of invited) {
    const friend = await readUser(ctx.tx, id);
    if (!friend?.name) throw validation("Такого друга нет");
    if (!(await areFriends(ctx.tx, owner.id, id))) {
      throw validation(
        "Позвать можно только друзей — остальным отправь ссылку",
      );
    }
  }
  const customIds = unique(input.customActivityIds);
  const custom = await readCustomActivities(ctx.tx, customIds);
  for (const id of customIds) {
    if (custom.get(id)?.createdBy !== owner.id) {
      throw validation("Своё занятие не найдено — добавь его заново");
    }
  }
  const live = input.mode === "live";
  const plan: PlanSession = {
    id: `pl_${nanoid(10)}`,
    title: input.title,
    ownerId: owner.id,
    mode: input.mode,
    ...(live ? {} : { deadline: input.deadline }),
    status: live ? "lobby" : "swiping",
    participantIds: [owner.id, ...invited],
    readyIds: live ? [owner.id] : [],
    matchRule: input.matchRule,
    // Размер колоды — уже итоговый: по умолчанию «Прямо сейчас» — 20 (X05).
    filters: {
      ...input.filters,
      deckSize: resolveDeckSize(input.mode, input.filters.deckSize),
    },
    customActivityIds: customIds,
    deck: [],
    swipes: {},
    finishedIds: [],
    votes: {},
    createdAt: nowIso(ctx.clock),
  };
  const source = await activitiesFor(ctx.tx, plan, ctx.catalog.activities);
  const pool = poolOf(plan, source);
  if (pool.length === 0) {
    throw validation(
      "Под эти фильтры нет ни одного занятия — расширь бюджет или добавь своё",
    );
  }
  if (!live) plan.deck = ctx.random.shuffle(pool.map((a) => a.id));
  await insertPlan(ctx.tx, plan, now);
  // «До даты» стартует сразу (Q02: старт — по плану).
  if (!live) {
    await reachPlanStep(ctx.tx, plan.id, "plan_started_group", now, owner.id);
  }
  await reachStep(ctx.tx, owner.id, "plan_created", now);
  changed(ctx, plan);
  return viewOf(
    ctx.tx,
    await loadPlan(ctx.tx, plan.id, { lock: false }),
    source,
  );
};

// POST /plans/:id/join — вступить по ссылке-приглашению; вступивший —
// друг организатору (§4.3). Повтор ничего не меняет.
export const joinPlan: ServerHandler = async (ctx, { params }) => {
  // Сначала — есть ли план: на битую ссылку имя спрашивать незачем.
  await loadPlan(ctx.tx, params.id ?? "", { lock: false });
  const me = await readNamedMe(ctx);
  const {
    result: joined,
    source,
    plan,
  } = await withPlan(ctx, params.id ?? "", (plan) => {
    if (plan.participantIds.includes(me.id)) return false;
    if (plan.status === "results" || plan.status === "decided") {
      throw conflict("Выбор уже закончился — вступить нельзя");
    }
    plan.participantIds.push(me.id);
    return true;
  });
  if (joined) {
    await makeFriends(ctx.tx, plan.ownerId, me.id, "plan", ctx.clock);
    await reachStep(ctx.tx, me.id, "plan_joined", ctx.clock.now());
    changed(ctx, plan);
  }
  return viewOf(ctx.tx, plan, source);
};

// ── Лобби ───────────────────────────────────────────────────────────

// POST /plans/:id/ready { ready? } — «Готов» в лобби и снять отметку.
export const setReady: ServerHandler = async (ctx, { params, body }) => {
  const { ready } = parseInput(ReadyBodySchema, body ?? {});
  const me = await readMe(ctx);
  const { source, plan } = await withPlan(ctx, params.id ?? "", (plan) => {
    requireParticipant(plan, me);
    if (plan.status !== "lobby") throw conflict("План уже начался");
    if (!ready && me.id === plan.ownerId) {
      throw validation("Организатор всегда готов");
    }
    const others = plan.readyIds.filter((id) => id !== me.id);
    plan.readyIds = ready ? [...others, me.id] : others;
  });
  changed(ctx, plan);
  return viewOf(ctx.tx, plan, source);
};

// POST /plans/:id/start — «Поехали»: организатор, когда готовы двое.
// Колода перемешивается один раз здесь — порядок один для всех.
export const startPlan: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const { source, plan } = await withPlan(
    ctx,
    params.id ?? "",
    (plan, source) => {
      if (plan.ownerId !== me.id) {
        throw forbidden("Запустить план может только организатор");
      }
      if (plan.status !== "lobby") throw conflict("План уже запущен");
      const ready = plan.readyIds.filter((id) =>
        plan.participantIds.includes(id),
      );
      if (ready.length < MIN_READY) {
        throw conflict("Подожди, пока будут готовы хотя бы двое");
      }
      const pool = poolOf(plan, source);
      if (pool.length === 0) {
        throw conflict("Под эти фильтры не осталось занятий — добавь своё");
      }
      plan.deck = ctx.random.shuffle(pool.map((activity) => activity.id));
      plan.status = "swiping";
    },
  );
  await reachPlanStep(
    ctx.tx,
    plan.id,
    "plan_started_group",
    ctx.clock.now(),
    me.id,
  );
  changed(ctx, plan);
  return viewOf(ctx.tx, plan, source);
};

// ── Свайп колоды ────────────────────────────────────────────────────

const progressOf = (plan: PlanSession, userId: string, deckIds: string[]) => {
  const mine = plan.swipes[userId] ?? {};
  return {
    done: deckIds.filter((id) => mine[id] !== undefined).length,
    total: deckIds.length,
  };
};

const matchIdsOf = (plan: PlanSession, deck: Activity[]) =>
  new Set(computeMatches(plan, deck).matches.map((m) => m.activityId));

const isPastDeadline = (plan: PlanSession, now: number) =>
  plan.mode === "deadline" && Date.parse(plan.deadline ?? "") <= now;

const requireSwiping = (plan: PlanSession, now: number) => {
  if (plan.status === "lobby") throw conflict("План ещё не начался");
  if (plan.status !== "swiping") throw conflict("Выбор уже закончился");
  if (isPastDeadline(plan, now)) {
    throw conflict("Время вышло — смотрим результаты");
  }
};

const markFinished = (plan: PlanSession, userId: string) => {
  if (!plan.finishedIds.includes(userId)) plan.finishedIds.push(userId);
};

// Закончили все — сразу к результатам, в обоих режимах.
const completeIfAllFinished = (plan: PlanSession) => {
  if (plan.status === "swiping" && allFinished(plan)) plan.status = "results";
};

// POST /plans/:id/swipes { activityId, decision } — повтор заменяет прежний;
// последняя карточка — «закончил». plan:match — только для совпадений,
// которые появились именно этим свайпом: под блокировкой строки плана
// одновременные свайпы идут по очереди, и каждое совпадение — одно событие.
export const swipePlan: ServerHandler = async (ctx, { params, body }) => {
  const input = parseInput(SwipeBodySchema, body);
  const me = await readMe(ctx);
  const { result, source, plan } = await withPlan(
    ctx,
    params.id ?? "",
    (plan, source) => {
      requireParticipant(plan, me);
      requireSwiping(plan, ctx.clock.now());
      const deck = deckOf(plan, source);
      const deckIds = deck.map((activity) => activity.id);
      if (!deckIds.includes(input.activityId)) {
        throw validation("Этого занятия нет в колоде");
      }
      const before = matchIdsOf(plan, deck);
      plan.swipes[me.id] = {
        ...plan.swipes[me.id],
        [input.activityId]: input.decision,
      };
      const after = matchIdsOf(plan, deck);
      const progress = progressOf(plan, me.id, deckIds);
      if (progress.done >= progress.total) markFinished(plan, me.id);
      completeIfAllFinished(plan);
      return {
        newMatches: [...after].filter((id) => !before.has(id)),
        progress,
      };
    },
  );
  changed(ctx, plan);
  progressEvent(ctx, plan, me.id, result.progress);
  for (const activityId of result.newMatches) {
    ctx.events.publish(
      { type: "plan:match", planId: plan.id, activityId },
      audienceOf(ctx, plan),
    );
  }
  return viewOf(ctx.tx, plan, source);
};

// POST /plans/:id/swipes/undo { activityId } — «Вернуть карточку».
export const undoPlanSwipe: ServerHandler = async (ctx, { params, body }) => {
  const input = parseInput(UndoBodySchema, body);
  const me = await readMe(ctx);
  const { result, source, plan } = await withPlan(
    ctx,
    params.id ?? "",
    (plan, source) => {
      requireParticipant(plan, me);
      requireSwiping(plan, ctx.clock.now());
      const { [input.activityId]: removed, ...rest } = plan.swipes[me.id] ?? {};
      if (removed === undefined) {
        throw conflict("Эту карточку ты ещё не свайпал");
      }
      plan.swipes[me.id] = rest;
      const deckIds = deckOf(plan, source).map((activity) => activity.id);
      const progress = progressOf(plan, me.id, deckIds);
      if (progress.done < progress.total) {
        plan.finishedIds = plan.finishedIds.filter((id) => id !== me.id);
      }
      return progress;
    },
  );
  changed(ctx, plan);
  progressEvent(ctx, plan, me.id, result);
  return viewOf(ctx.tx, plan, source);
};

// POST /plans/:id/finish — участник закончил колоду. Повтор и вызов после
// перехода к результатам ничего не меняют.
export const finishPlan: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const {
    result: didChange,
    source,
    plan,
  } = await withPlan(ctx, params.id ?? "", (plan) => {
    requireParticipant(plan, me);
    if (plan.finishedIds.includes(me.id) || plan.status !== "swiping") {
      if (plan.status === "lobby") throw conflict("План ещё не начался");
      return false;
    }
    markFinished(plan, me.id);
    completeIfAllFinished(plan);
    return true;
  });
  if (didChange) changed(ctx, plan);
  return viewOf(ctx.tx, plan, source);
};

// ── Результаты и решение ────────────────────────────────────────────

const requireResults = (plan: PlanSession) => {
  if (plan.status === "decided") {
    throw conflict("Решение уже принято — сначала отмени его");
  }
  if (plan.status !== "results") {
    throw conflict("Результатов ещё нет — сначала досвайпайте колоду");
  }
};

// Голоса только за нынешние варианты.
const keepValidVotes = (plan: PlanSession, deck: Activity[]) => {
  const allowed = new Set(voteCandidates(plan, deck));
  plan.votes = Object.fromEntries(
    Object.entries(plan.votes).filter(([, id]) => allowed.has(id)),
  );
};

// POST /plans/:id/votes { activityId | null } — один голос, повтор
// заменяет, null снимает.
export const votePlan: ServerHandler = async (ctx, { params, body }) => {
  const input = parseInput(VoteBodySchema, body);
  const me = await readMe(ctx);
  const { source, plan } = await withPlan(
    ctx,
    params.id ?? "",
    (plan, source) => {
      requireParticipant(plan, me);
      requireResults(plan);
      const others = Object.entries(plan.votes).filter(([id]) => id !== me.id);
      if (input.activityId !== null) {
        const candidates = voteCandidates(plan, deckOf(plan, source));
        if (!candidates.includes(input.activityId)) {
          throw validation("За это занятие голосовать нельзя");
        }
        others.push([me.id, input.activityId]);
      }
      plan.votes = Object.fromEntries(others);
    },
  );
  changed(ctx, plan);
  return viewOf(ctx.tx, plan, source);
};

const chooseActivity = (
  ctx: ServerContext,
  plan: PlanSession,
  deck: Activity[],
  input: DecideBody,
): string => {
  if (input.method === "random") {
    const { pool } = decisionCandidates(plan, deck);
    if (pool.length === 0) {
      throw conflict(
        "Совпадений нет — посчитайте по большинству или добавьте занятий",
      );
    }
    return ctx.random.pick(pool);
  }
  if (!input.activityId) throw validation("Какое занятие выбрали?");
  if (input.method === "vote") {
    const { leaders } = tallyVotes(plan, deck);
    if (leaders.length === 0) throw conflict("Пока никто не проголосовал");
    if (!leaders.includes(input.activityId)) {
      throw conflict("Утвердить можно то, за что больше всех голосов");
    }
    return input.activityId;
  }
  if (!deck.some((activity) => activity.id === input.activityId)) {
    throw validation("Этого занятия нет в колоде");
  }
  return input.activityId;
};

// POST /plans/:id/decide — решает организатор; итог барабана выбирает
// сервер до анимации, и все экраны останавливают барабан на нём.
export const decidePlan: ServerHandler = async (ctx, { params, body }) => {
  const input = parseInput(DecideBodySchema, body);
  const me = await readMe(ctx);
  const { source, plan } = await withPlan(
    ctx,
    params.id ?? "",
    (plan, source) => {
      requireOwner(plan, me, "Решение принимает организатор");
      requireResults(plan);
      const activityId = chooseActivity(ctx, plan, deckOf(plan, source), input);
      plan.status = "decided";
      plan.decision = {
        activityId,
        method: input.method,
        decidedAt: nowIso(ctx.clock),
        ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
      };
    },
  );
  await reachStep(ctx.tx, me.id, "plan_decided", ctx.clock.now());
  // Компания дошла до «Решено» (Q02): план на троих и больше, один раз на
  // план — «Отменить решение» и снова «Решено» не считаются заново.
  if (plan.participantIds.length >= 3) {
    await reachPlanStep(
      ctx.tx,
      plan.id,
      "plan_decided_group",
      ctx.clock.now(),
      me.id,
    );
  }
  changed(ctx, plan);
  return viewOf(ctx.tx, plan, source);
};

// POST /plans/:id/close — «Показать итоги сейчас» (P04): итоги по
// долиставшим. Повтор ничего не меняет.
export const closePlan: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const {
    result: didChange,
    source,
    plan,
  } = await withPlan(ctx, params.id ?? "", (plan) => {
    requireOwner(plan, me, "Показать итоги может только организатор");
    if (plan.status === "results" || plan.status === "decided") return false;
    if (plan.status !== "swiping") throw conflict("План ещё не начался");
    if (finishedParticipants(plan).length < MIN_FINISHED_TO_CLOSE) {
      throw conflict("Показать итоги можно, когда долистают хотя бы двое");
    }
    plan.closedEarly = !allFinished(plan);
    delete plan.timedOut;
    plan.status = "results";
    plan.votes = {};
    return true;
  });
  if (didChange) changed(ctx, plan);
  return viewOf(ctx.tx, plan, source);
};

// POST /plans/:id/extend — «Продлить на сутки» (Y02): как в моке. Дата
// закрыла план — новая через сутки, план снова в колоде. Повтор, пока дата
// впереди, ничего не меняет.
export const extendPlan: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const now = ctx.clock.now();
  const {
    result: didChange,
    source,
    plan,
  } = await withPlan(ctx, params.id ?? "", (plan) => {
    requireOwner(plan, me, "Продлить план может только организатор");
    const refusal = extendRefusal(plan);
    if (refusal) throw conflict(refusal);
    return extendDeadline(plan, now);
  });
  if (didChange) changed(ctx, plan);
  return viewOf(ctx.tx, plan, source);
};

// POST /plans/:id/leave — «Выйти из плана» (Q04): как в моке. Строки
// свайпов и голоса ушедшего удаляет savePlan по разнице.
export const leavePlan: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const {
    result: didChange,
    source,
    plan,
  } = await withPlan(ctx, params.id ?? "", (plan) => {
    if (!plan.participantIds.includes(me.id)) return false;
    if (plan.ownerId === me.id) {
      throw forbidden("Организатор не может выйти из плана");
    }
    if (plan.status === "results" || plan.status === "decided") {
      throw conflict("Выбор уже закончился");
    }
    const others = (ids: string[]) => ids.filter((id) => id !== me.id);
    plan.participantIds = others(plan.participantIds);
    plan.readyIds = others(plan.readyIds);
    plan.finishedIds = others(plan.finishedIds);
    plan.swipes = Object.fromEntries(
      Object.entries(plan.swipes).filter(([id]) => id !== me.id),
    );
    plan.votes = Object.fromEntries(
      Object.entries(plan.votes).filter(([id]) => id !== me.id),
    );
    completeIfAllFinished(plan);
    return true;
  });
  if (didChange) changed(ctx, plan);
  return viewOf(ctx.tx, plan, source);
};

// POST /plans/:id/decide/cancel — «Отменить решение»: все снова на
// результатах, голоса — заново, остальным — тост.
export const cancelPlanDecision: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const { source, plan } = await withPlan(ctx, params.id ?? "", (plan) => {
    requireOwner(plan, me, "Отменить решение может только организатор");
    if (plan.status !== "decided") throw conflict("Решения ещё нет");
    plan.status = "results";
    delete plan.decision;
    plan.votes = {};
  });
  changed(ctx, plan);
  for (const forUserId of plan.participantIds) {
    if (forUserId === me.id) continue;
    ctx.events.publish(
      { type: "toast", text: "Организатор отменил решение", forUserId },
      [forUserId],
    );
  }
  return viewOf(ctx.tx, plan, source);
};

// POST /plans/:id/rule { matchRule } — «Считать по большинству».
export const setPlanRule: ServerHandler = async (ctx, { params, body }) => {
  const { matchRule } = parseInput(RuleBodySchema, body);
  const me = await readMe(ctx);
  const { source, plan } = await withPlan(
    ctx,
    params.id ?? "",
    (plan, source) => {
      requireOwner(plan, me, "Правило меняет организатор");
      requireResults(plan);
      plan.matchRule = matchRule;
      keepValidVotes(plan, deckOf(plan, source));
    },
  );
  changed(ctx, plan);
  return viewOf(ctx.tx, plan, source);
};

// POST /plans/:id/activities { activityIds, deadline? } — «Добавить ещё
// занятий»: в конец колоды, все снова свайпают только новое.
export const addPlanActivities: ServerHandler = async (
  ctx,
  { params, body },
) => {
  const input = parseInput(AddActivitiesBodySchema, body);
  const now = ctx.clock.now();
  if (input.deadline && Date.parse(input.deadline) <= now) {
    throw validation("Эта дата уже прошла");
  }
  const catalogIds = new Set(ctx.catalog.activities.map((a) => a.id));
  const me = await readMe(ctx);
  const requested = unique(input.activityIds);
  const custom = await readCustomActivities(
    ctx.tx,
    requested.filter((id) => !catalogIds.has(id)),
  );
  const { source, plan } = await withPlan(ctx, params.id ?? "", (plan) => {
    requireOwner(plan, me, "Добавлять занятия может только организатор");
    requireResults(plan);
    const inDeck = new Set(plan.deck);
    const added: string[] = [];
    for (const id of requested) {
      if (inDeck.has(id)) continue;
      if (!catalogIds.has(id)) {
        const activity = custom.get(id);
        if (!activity) throw validation("Такого занятия нет");
        if (activity.createdBy !== me.id) {
          throw validation("Своё занятие не найдено — добавь его заново");
        }
        if (!plan.customActivityIds.includes(id)) {
          plan.customActivityIds.push(id);
        }
      }
      added.push(id);
    }
    if (added.length === 0) throw validation("Эти занятия уже есть в колоде");
    plan.deck = [...plan.deck, ...added];
    plan.status = "swiping";
    plan.votes = {};
    delete plan.closedEarly;
    delete plan.timedOut;
    if (
      plan.mode === "deadline" &&
      (input.deadline || isPastDeadline(plan, now))
    ) {
      plan.deadline =
        input.deadline ?? new Date(now + EXTRA_ROUND_MS).toISOString();
    }
  });
  // «Закончил» — по новой колоде: новые карточки не свайпал никто.
  const fresh = structuredClone(plan);
  const deckIds = deckOf(fresh, source).map((activity) => activity.id);
  fresh.finishedIds = fresh.participantIds.filter((id) => {
    const { done, total } = progressOf(fresh, id, deckIds);
    return done >= total;
  });
  await savePlan(ctx.tx, plan, fresh, now);
  changed(ctx, fresh);
  return viewOf(ctx.tx, fresh, source);
};

// ── Свои занятия ────────────────────────────────────────────────────

// POST /activities — «+ Своё занятие». Живёт отдельно от плана: форма
// создаёт его до того, как план сохранён. Фото — только своя загрузка
// (POST /uploads, B13).
export const createCustomActivity: ServerHandler = async (ctx, { body }) => {
  const input = parseInput(CustomActivityInputSchema, body);
  const me = await readMe(ctx);
  if (input.imageKey) {
    const [upload] = await ctx.tx
      .select({ key: uploads.key })
      .from(uploads)
      .where(and(eq(uploads.key, input.imageKey), eq(uploads.ownerId, me.id)))
      .limit(1);
    if (!upload) throw validation("Фото не найдено — загрузи его заново");
  }
  const min = input.pricePerPersonMin ?? input.pricePerPersonMax ?? 0;
  const activity: Activity = {
    id: `ca_${nanoid(10)}`,
    title: input.title,
    description: input.description,
    category: input.category,
    tags: [],
    pricePerPersonMin: min,
    pricePerPersonMax: input.pricePerPersonMax ?? min,
    durationMin: 0,
    durationMax: 0,
    seasons: [],
    groupSize: { min: 1, max: null },
    ...(input.place ? { place: input.place } : {}),
    ...(input.imageKey ? { imageKey: input.imageKey } : {}),
    isCustom: true,
    createdBy: me.id,
  };
  await ctx.tx.insert(customActivities).values({
    id: activity.id,
    createdBy: me.id,
    activity,
    imageKey: input.imageKey ?? null,
    createdAt: new Date(ctx.clock.now()),
  });
  ctx.events.publish(
    { type: "db:changed", scope: ["plans"], id: activity.id },
    [me.id],
  );
  return activity;
};

// ── Дедлайны (планировщик — B13) ────────────────────────────────────

// Планы «До даты», которым пора к результатам: наступила дата или ждать
// уже некого (участник удалил профиль). Зовёт планировщик сервера.
export const expireDuePlans = async (
  tx: Tx,
  now: number,
): Promise<string[]> => {
  const rows = await tx
    .select({ id: plans.id })
    .from(plans)
    .where(
      and(
        eq(plans.mode, "deadline"),
        eq(plans.status, "swiping"),
        sql`(${plans.deadline} <= ${new Date(now)} or not exists (
          select 1 from plan_participants pp
          where pp.plan_id = ${plans.id} and not pp.finished
        ))`,
      ),
    );
  const expired: string[] = [];
  for (const { id } of rows) {
    const before = await loadPlan(tx, id, { lock: true });
    if (before.status !== "swiping") continue;
    // С отстающими — итоги по долиставшим, как «Показать итоги сейчас»
    // (Y02); тем же правилом закрывает мок.
    const after = structuredClone(before);
    closeAtDeadline(after);
    await savePlan(tx, before, after, now);
    expired.push(id);
  }
  return expired;
};
