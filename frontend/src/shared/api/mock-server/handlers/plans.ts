import { pickPlanDeck, resolveDeckSize } from "@swipeit/core/logic/plan-deck";
import { nanoid } from "nanoid";
import { z } from "zod";

import type { BotTrigger } from "@/shared/lib/realtime/types";

import type { Activity } from "../../catalog/types";
import {
  computeMatches,
  decisionCandidates,
  tallyVotes,
  voteCandidates,
} from "../../plans/matches";
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
import { parseInput, requireNamedUser, requireUser } from "./common";

// «Че делать будем?» — список, создание, вступление, лобби, свайп колоды и
// совпадения, результаты и решение, дедлайны «До даты» (TECH_SPEC §5, §6,
// §7; DESIGN.md §8.7).

// Сколько готовых нужно, чтобы организатор мог нажать «Поехали».
const MIN_READY = 2;
const PREVIEW_SIZE = 3;

const ReadyBodySchema = z.object({ ready: z.boolean().default(true) });

const SwipeBodySchema = z.object({
  activityId: z.string().min(1, "Какое занятие?"),
  decision: z.enum(["like", "pass"]),
});

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
      name: name ?? "",
      avatarColor,
      isBot,
    }));

const customOf = (db: Db, plan: PlanSession): Activity[] =>
  plan.customActivityIds
    .map((id) => db.customActivities[id])
    .filter((activity): activity is Activity => Boolean(activity));

// Из чего собирается колода: свои занятия (в обход фильтров — их добавили
// специально) и каталог по фильтрам плана — не больше размера колоды, из
// разных категорий (X05). Выбор одинаков при каждом чтении: лобби
// показывает ровно то, что попадёт в колоду.
const poolOf = (db: Db, plan: PlanSession, catalog: Activity[]): Activity[] =>
  pickPlanDeck(
    customOf(db, plan),
    catalog.filter((activity) => matchesPlanFilters(activity, plan.filters)),
    plan.filters.deckSize ?? null,
    plan.id,
  );

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
    // Участники увидят организатора по имени (DESIGN §8.7).
    const owner = requireNamedUser(ctx, db);
    const invited = unique(input.participantIds).filter(
      (id) => id !== owner.id,
    );
    for (const id of invited) {
      // Безымянного никто не узнает — в списке друзей его нет (§7a).
      const friend = db.users[id];
      if (!friend || !friend.name) throw validation("Такого друга нет");
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
      // Размер колоды — уже итоговый: по умолчанию «Прямо сейчас» — 20.
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
    // Сначала — есть ли план: на битую ссылку имя спрашивать незачем.
    const plan = findPlan(db, params.id);
    const user = requireNamedUser(ctx, db);
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

// ── Свайп колоды (T14) ──────────────────────────────────────────────

const UndoBodySchema = z.object({
  activityId: z.string().min(1, "Какое занятие?"),
});

// Карточки, которые участник реально может свайпнуть: колода без занятий,
// пропавших из каталога. По ним же считаются прогресс и «закончил».
const deckIdsOf = (db: Db, plan: PlanSession, catalog: Activity[]) =>
  deckOf(db, plan, catalog).map((activity) => activity.id);

const progressOf = (plan: PlanSession, userId: string, deckIds: string[]) => {
  const mine = plan.swipes[userId] ?? {};
  return {
    done: deckIds.filter((id) => mine[id] !== undefined).length,
    total: deckIds.length,
  };
};

const matchIdsOf = (plan: PlanSession, deck: Activity[]) =>
  new Set(computeMatches(plan, deck).matches.map((m) => m.activityId));

// Дедлайн «До даты» по часам сервера (с перемоткой). Планировщик закрывает
// план раз в 15 с — а свайп в эти секунды после даты уже не принимаем.
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

const allFinished = (plan: PlanSession) =>
  plan.participantIds.every((id) => plan.finishedIds.includes(id));

// Закончили все — сразу к результатам, в обоих режимах: «До даты» не ждёт
// дедлайна, если ждать уже некого (DESIGN.md §8.7).
const completeIfAllFinished = (plan: PlanSession) => {
  if (plan.status === "swiping" && allFinished(plan)) plan.status = "results";
};

const progressEvent = (
  ctx: HandlerContext,
  planId: string,
  userId: string,
  progress: { done: number; total: number },
) =>
  ctx.realtime.publish({ type: "plan:progress", planId, userId, ...progress });

// POST /plans/:id/swipes { activityId, decision } — решение по карточке.
// Повторный свайп той же карточки заменяет прежний. Последняя карточка —
// участник «закончил» сам, без отдельного /finish (боты и люди не обязаны
// его звать). plan:match — только для занятий, которые стали совпадением
// именно этим свайпом: оверлей не всплывает дважды.
export const swipePlan: Handler = async (ctx, { params, body }) => {
  const input = parseInput(SwipeBodySchema, body);
  const catalog = await ctx.catalog.activities();
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireParticipant(plan, user);
    requireSwiping(plan, ctx.clock.now());
    const deck = deckOf(db, plan, catalog);
    const deckIds = deck.map((activity) => activity.id);
    if (!deckIds.includes(input.activityId)) {
      throw validation("Этого занятия нет в колоде");
    }
    const before = matchIdsOf(plan, deck);
    plan.swipes[user.id] = {
      ...plan.swipes[user.id],
      [input.activityId]: input.decision,
    };
    const after = matchIdsOf(plan, deck);
    const progress = progressOf(plan, user.id, deckIds);
    if (progress.done >= progress.total) markFinished(plan, user.id);
    completeIfAllFinished(plan);
    return {
      newMatches: [...after].filter((id) => !before.has(id)),
      progress,
      userId: user.id,
      view: viewOf(db, plan, catalog),
    };
  });
  const planId = result.view.plan.id;
  changed(ctx, planId);
  progressEvent(ctx, planId, result.userId, result.progress);
  for (const activityId of result.newMatches) {
    ctx.realtime.publish({ type: "plan:match", planId, activityId });
  }
  return result.view;
};

// POST /plans/:id/swipes/undo { activityId } — «Вернуть карточку»
// (reference.html). Расширение TECH_SPEC §6. Совпадение, которое пропало
// из-за отмены, событием не «отзывается»: экраны пересчитывают его сами
// через computeMatches.
export const undoPlanSwipe: Handler = async (ctx, { params, body }) => {
  const input = parseInput(UndoBodySchema, body);
  const catalog = await ctx.catalog.activities();
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireParticipant(plan, user);
    requireSwiping(plan, ctx.clock.now());
    const { [input.activityId]: removed, ...rest } = plan.swipes[user.id] ?? {};
    if (removed === undefined) {
      throw conflict("Эту карточку ты ещё не свайпал");
    }
    plan.swipes[user.id] = rest;
    const progress = progressOf(plan, user.id, deckIdsOf(db, plan, catalog));
    // Карточка снова в колоде — значит, колода не досвайпана.
    if (progress.done < progress.total) {
      plan.finishedIds = plan.finishedIds.filter((id) => id !== user.id);
    }
    return { progress, userId: user.id, view: viewOf(db, plan, catalog) };
  });
  const planId = result.view.plan.id;
  changed(ctx, planId);
  progressEvent(ctx, planId, result.userId, result.progress);
  return result.view;
};

// POST /plans/:id/finish — участник закончил колоду. Повторный вызов и
// вызов после перехода к результатам ничего не меняют. Не требует свайпов
// всех карточек: клиент мог не увидеть часть колоды (занятие пропало из
// каталога), и застрять из-за этого нельзя.
export const finishPlan: Handler = async (ctx, { params }) => {
  const catalog = await ctx.catalog.activities();
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireParticipant(plan, user);
    if (plan.finishedIds.includes(user.id) || plan.status !== "swiping") {
      if (plan.status === "lobby") throw conflict("План ещё не начался");
      return { changed: false, view: viewOf(db, plan, catalog) };
    }
    markFinished(plan, user.id);
    completeIfAllFinished(plan);
    return { changed: true, view: viewOf(db, plan, catalog) };
  });
  if (result.changed) changed(ctx, result.view.plan.id);
  return result.view;
};

// ── Результаты и решение (T15) ──────────────────────────────────────

// «Добавить ещё занятий» в плане «До даты», когда дата уже прошла: без
// продления новый круг закрылся бы на первой же проверке планировщика.
const EXTRA_ROUND_MS = 24 * 3600_000;

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
  // Для vote и owner. У random результат выбирает сервер.
  activityId: z.string().min(1).optional(),
  // Когда идём. Без него экран и .ics берут ближайшую субботу 12:00.
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
  // Только «До даты»: новая дата нового круга.
  deadline: IsoDateSchema.optional(),
});

type DecideBody = z.infer<typeof DecideBodySchema>;

const requireOwner = (plan: PlanSession, user: User, message: string) => {
  if (plan.ownerId !== user.id) throw forbidden(message);
};

const requireResults = (plan: PlanSession) => {
  if (plan.status === "decided") {
    throw conflict("Решение уже принято — сначала отмени его");
  }
  if (plan.status !== "results") {
    throw conflict("Результатов ещё нет — сначала досвайпайте колоду");
  }
};

// Голоса только за нынешние варианты: после смены правила часть занятий
// перестаёт быть совпадением, и голос за них уже ничего не значит.
const keepValidVotes = (plan: PlanSession, deck: Activity[]) => {
  const allowed = new Set(voteCandidates(plan, deck));
  plan.votes = Object.fromEntries(
    Object.entries(plan.votes).filter(([, id]) => allowed.has(id)),
  );
};

// POST /plans/:id/votes { activityId | null } — «Выбрать самим»: у каждого
// участника один голос, повторный заменяет прежний, null снимает. Голосуют
// за совпадения, нет их — за «почти», нет и их — за любое занятие колоды.
export const votePlan: Handler = async (ctx, { params, body }) => {
  const input = parseInput(VoteBodySchema, body);
  const catalog = await ctx.catalog.activities();
  const view = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireParticipant(plan, user);
    requireResults(plan);
    const others = Object.entries(plan.votes).filter(([id]) => id !== user.id);
    if (input.activityId !== null) {
      const candidates = voteCandidates(plan, deckOf(db, plan, catalog));
      if (!candidates.includes(input.activityId)) {
        throw validation("За это занятие голосовать нельзя");
      }
      others.push([user.id, input.activityId]);
    }
    plan.votes = Object.fromEntries(others);
    return viewOf(db, plan, catalog);
  });
  changed(ctx, view.plan.id);
  // Голосование началось или продолжается — боты-участники голосуют тоже.
  if (input.activityId !== null) trigger(ctx, "plan:voted", view.plan.id);
  return view;
};

const chooseActivity = (
  ctx: HandlerContext,
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

// POST /plans/:id/decide — решение принимает организатор (TECH_SPEC §6):
// { method: "random" } — барабан, итог выбирает сервер через ctx.random
// ДО анимации, и все вкладки останавливают барабан на нём (TASKS T15).
// Крутит только организатор: двое, нажавшие одновременно, получили бы два
// разных итога. { method: "vote", activityId } — «Утвердить» лидера
// голосования; { method: "owner", activityId } — организатор выбрал сам.
// Отдельного события нет: по db:changed экраны перечитывают план и видят
// новое decision (method: "random" — повод крутить барабан).
export const decidePlan: Handler = async (ctx, { params, body }) => {
  const input = parseInput(DecideBodySchema, body);
  const catalog = await ctx.catalog.activities();
  const view = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireOwner(plan, user, "Решение принимает организатор");
    // Решённый план второй раз не крутится: «Крутить ещё раз» нет, иначе
    // барабан перестаёт быть честным (DESIGN.md §8.7).
    requireResults(plan);
    const activityId = chooseActivity(
      ctx,
      plan,
      deckOf(db, plan, catalog),
      input,
    );
    plan.status = "decided";
    plan.decision = {
      activityId,
      method: input.method,
      decidedAt: nowIso(ctx.clock),
      ...(input.scheduledFor ? { scheduledFor: input.scheduledFor } : {}),
    };
    return viewOf(db, plan, catalog);
  });
  changed(ctx, view.plan.id);
  return view;
};

// Сколько должны долистать, чтобы организатор мог показать итоги, не
// дожидаясь остальных (auto-tasks P04): с одним «совпадение» — это просто
// его лайки.
const MIN_FINISHED_TO_CLOSE = 2;

// POST /plans/:id/close — «Показать итоги сейчас»: кто-то бросил колоду, а
// ждать вечно нельзя (PRD §6.3). Итоги — по долиставшим (closedEarly);
// недолиставшие тоже видят итоги, их колода закрыта. Повтор ничего не
// меняет.
export const closePlan: Handler = async (ctx, { params }) => {
  const catalog = await ctx.catalog.activities();
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireOwner(plan, user, "Показать итоги может только организатор");
    if (plan.status === "results" || plan.status === "decided") {
      return { changed: false, view: viewOf(db, plan, catalog) };
    }
    if (plan.status !== "swiping") throw conflict("План ещё не начался");
    const finished = plan.participantIds.filter((id) =>
      plan.finishedIds.includes(id),
    );
    if (finished.length < MIN_FINISHED_TO_CLOSE) {
      throw conflict("Показать итоги можно, когда долистают хотя бы двое");
    }
    plan.closedEarly = !allFinished(plan);
    plan.status = "results";
    plan.votes = {};
    return { changed: true, view: viewOf(db, plan, catalog) };
  });
  if (result.changed) changed(ctx, result.view.plan.id);
  return result.view;
};

// POST /plans/:id/leave — «Выйти из плана» (auto-tasks-pm-2 Q04): человек
// передумал. Уходит из участников, «Готов» и «Долистал», его свайпы и голос
// не попадают в итоги; остальные долистали — сразу итоги. Организатор выйти
// не может (план держится на нём), после итогов — тоже. Повтор ничего не
// меняет.
export const leavePlan: Handler = async (ctx, { params }) => {
  const catalog = await ctx.catalog.activities();
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    if (!plan.participantIds.includes(user.id)) {
      return { changed: false, view: viewOf(db, plan, catalog) };
    }
    if (plan.ownerId === user.id) {
      throw forbidden("Организатор не может выйти из плана");
    }
    if (plan.status === "results" || plan.status === "decided") {
      throw conflict("Выбор уже закончился");
    }
    const others = (ids: string[]) => ids.filter((id) => id !== user.id);
    plan.participantIds = others(plan.participantIds);
    plan.readyIds = others(plan.readyIds);
    plan.finishedIds = others(plan.finishedIds);
    plan.swipes = Object.fromEntries(
      Object.entries(plan.swipes).filter(([id]) => id !== user.id),
    );
    plan.votes = Object.fromEntries(
      Object.entries(plan.votes).filter(([id]) => id !== user.id),
    );
    completeIfAllFinished(plan);
    return { changed: true, view: viewOf(db, plan, catalog) };
  });
  if (result.changed) changed(ctx, result.view.plan.id);
  return result.view;
};

// POST /plans/:id/decide/cancel — «Отменить решение»: только организатор.
// Все снова на экране результатов, голоса — заново. Остальным людям —
// тост (боты тостов не читают).
export const cancelPlanDecision: Handler = async (ctx, { params }) => {
  const catalog = await ctx.catalog.activities();
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireOwner(plan, user, "Отменить решение может только организатор");
    if (plan.status !== "decided") throw conflict("Решения ещё нет");
    plan.status = "results";
    delete plan.decision;
    plan.votes = {};
    const notify = plan.participantIds.filter((id) => {
      const other = db.users[id];
      return id !== user.id && other !== undefined && !other.isBot;
    });
    return { notify, view: viewOf(db, plan, catalog) };
  });
  changed(ctx, result.view.plan.id);
  for (const forUserId of result.notify) {
    ctx.realtime.publish({
      type: "toast",
      text: "Организатор отменил решение",
      forUserId,
    });
  }
  return result.view;
};

// POST /plans/:id/rule { matchRule } — «Считать по большинству» на экране
// «Совпадений нет» (TECH_SPEC §6, «computeMatches»). Расширение TECH_SPEC
// §6: в таблице маршрутов его нет. Только организатор, только на
// результатах.
export const setPlanRule: Handler = async (ctx, { params, body }) => {
  const { matchRule } = parseInput(RuleBodySchema, body);
  const catalog = await ctx.catalog.activities();
  const view = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireOwner(plan, user, "Правило меняет организатор");
    requireResults(plan);
    plan.matchRule = matchRule;
    keepValidVotes(plan, deckOf(db, plan, catalog));
    return viewOf(db, plan, catalog);
  });
  changed(ctx, view.plan.id);
  return view;
};

// POST /plans/:id/activities { activityIds, deadline? } — «Добавить ещё
// занятий»: занятия каталога или свои (POST /activities) — в конец колоды,
// и все снова свайпают, уже только новые карточки. Расширение TECH_SPEC §6.
// plan:started — повторно: боты досвайпывают новое. «До даты» с прошедшей
// датой получает новую: из тела или +1 день от «сейчас».
export const addPlanActivities: Handler = async (ctx, { params, body }) => {
  const input = parseInput(AddActivitiesBodySchema, body);
  const now = ctx.clock.now();
  if (input.deadline && Date.parse(input.deadline) <= now) {
    throw validation("Эта дата уже прошла");
  }
  const catalog = await ctx.catalog.activities();
  const catalogIds = new Set(catalog.map((activity) => activity.id));
  const view = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const plan = findPlan(db, params.id);
    requireOwner(plan, user, "Добавлять занятия может только организатор");
    requireResults(plan);
    const inDeck = new Set(plan.deck);
    const added: string[] = [];
    for (const id of unique(input.activityIds)) {
      if (inDeck.has(id)) continue;
      if (!catalogIds.has(id)) {
        const custom = db.customActivities[id];
        if (!custom) throw validation("Такого занятия нет");
        if (custom.createdBy !== user.id) {
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
    // Новый раунд — снова ждём всех.
    delete plan.closedEarly;
    // Новые карточки не свайпал никто — «закончил» пересчитываем по колоде.
    const deckIds = deckIdsOf(db, plan, catalog);
    plan.finishedIds = plan.participantIds.filter((id) => {
      const { done, total } = progressOf(plan, id, deckIds);
      return done >= total;
    });
    if (
      plan.mode === "deadline" &&
      (input.deadline || isPastDeadline(plan, now))
    ) {
      plan.deadline =
        input.deadline ?? new Date(now + EXTRA_ROUND_MS).toISOString();
    }
    return viewOf(db, plan, catalog);
  });
  changed(ctx, view.plan.id);
  trigger(ctx, "plan:started", view.plan.id);
  return view;
};

// План «До даты» пора закрыть: наступила дата или ждать уже некого.
const isDue = (plan: PlanSession, now: number) =>
  plan.mode === "deadline" &&
  plan.status === "swiping" &&
  (isPastDeadline(plan, now) || allFinished(plan));

// Планировщик дедлайнов (TECH_SPEC §7 «Часы»): все планы «До даты», у
// которых наступила дата по ctx.clock (с перемоткой), — к результатам.
// Сначала чтение: планировщик зовёт это каждые 15 с из каждой вкладки, и
// пустой проход не должен ничего записывать.
export const expireDuePlans = async (
  ctx: HandlerContext,
): Promise<string[]> => {
  const now = ctx.clock.now();
  const current = await ctx.db.read();
  if (!Object.values(current.plans).some((plan) => isDue(plan, now))) {
    return [];
  }
  const expired = await ctx.db.write((db) => {
    const due = Object.values(db.plans).filter((plan) => isDue(plan, now));
    for (const plan of due) plan.status = "results";
    return due.map((plan) => plan.id);
  });
  for (const id of expired) changed(ctx, id);
  return expired;
};

// POST /plans/expire — тот же проход по запросу. Расширение TECH_SPEC §6:
// клиентский планировщик зовёт его раз в 15 с и при возвращении во вкладку,
// LAN-сервер — сам по таймеру. Пользователь не нужен: правило зависит
// только от часов.
export const expirePlans: Handler = async (ctx) => ({
  expired: await expireDuePlans(ctx),
});
