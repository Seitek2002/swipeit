import type { Activity } from "@swipeit/core/api/catalog/types";
import type {
  PlanFilters,
  PlanParticipant,
  PlanSession,
  PlanSummary,
  PlanView,
} from "@swipeit/core/api/plans/types";
import type { User } from "@swipeit/core/api/users/types";
import { notFound } from "@swipeit/core/errors";
import { matchesPlanFilters } from "@swipeit/core/logic/activities";
import { pickPlanDeck } from "@swipeit/core/logic/plan-deck";
import { and, asc, eq, inArray } from "drizzle-orm";

import type { Tx } from "../../context";
import {
  customActivities,
  planParticipants,
  plans,
  planSwipes,
  planVotes,
  users,
} from "../../db/schema";

// Планы в базе (BACKEND.md B10): строка плана, участники, свайпы и голоса —
// отдельными строками. Обработчики работают с тем же PlanSession, что и мок:
// loadPlan собирает его из строк, savePlan записывает только разницу.

type Decision = NonNullable<PlanSession["decision"]>;
type SwipeDecision = "like" | "pass";

// План со строками — под блокировкой строки плана (§2.6), если lock.
export const loadPlan = async (
  tx: Tx,
  id: string,
  { lock }: { lock: boolean },
): Promise<PlanSession> => {
  const query = tx.select().from(plans).where(eq(plans.id, id)).limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw notFound("План не найден");
  // По очереди: в транзакции одно соединение, параллельные запросы на нём
  // pg уже не принимает (pg@9).
  const members = await tx
    .select()
    .from(planParticipants)
    .where(eq(planParticipants.planId, id))
    .orderBy(asc(planParticipants.seq));
  const swipes = await tx
    .select()
    .from(planSwipes)
    .where(eq(planSwipes.planId, id));
  const votes = await tx
    .select()
    .from(planVotes)
    .where(eq(planVotes.planId, id));
  const swipesBy: PlanSession["swipes"] = {};
  for (const swipe of swipes) {
    swipesBy[swipe.userId] = {
      ...swipesBy[swipe.userId],
      [swipe.activityId]: swipe.decision as SwipeDecision,
    };
  }
  return {
    id: row.id,
    title: row.title,
    ownerId: row.ownerId,
    mode: row.mode as PlanSession["mode"],
    ...(row.deadline ? { deadline: row.deadline.toISOString() } : {}),
    status: row.status as PlanSession["status"],
    participantIds: members.map((member) => member.userId),
    readyIds: members.filter((m) => m.ready).map((m) => m.userId),
    matchRule: row.matchRule as PlanSession["matchRule"],
    filters: row.filters as PlanFilters,
    customActivityIds: row.customActivityIds,
    deck: row.deck,
    swipes: swipesBy,
    finishedIds: members.filter((m) => m.finished).map((m) => m.userId),
    ...(row.closedEarly ? { closedEarly: true } : {}),
    ...(row.timedOut ? { timedOut: true } : {}),
    votes: Object.fromEntries(
      votes.map((vote) => [vote.userId, vote.activityId]),
    ),
    ...(row.decision ? { decision: row.decision as Decision } : {}),
    createdAt: row.createdAt.toISOString(),
  };
};

const planColumns = (plan: PlanSession) => ({
  title: plan.title,
  ownerId: plan.ownerId,
  mode: plan.mode,
  deadline: plan.deadline ? new Date(plan.deadline) : null,
  status: plan.status,
  matchRule: plan.matchRule,
  filters: plan.filters,
  deck: plan.deck,
  customActivityIds: plan.customActivityIds,
  decision: plan.decision ?? null,
  closedEarly: plan.closedEarly ?? false,
  timedOut: plan.timedOut ?? false,
});

const memberRow = (plan: PlanSession, userId: string, joinedAt: Date) => ({
  planId: plan.id,
  userId,
  ready: plan.readyIds.includes(userId),
  finished: plan.finishedIds.includes(userId),
  joinedAt,
});

// Новый план: строка и участники в порядке participantIds.
export const insertPlan = async (tx: Tx, plan: PlanSession, now: number) => {
  await tx.insert(plans).values({
    id: plan.id,
    ...planColumns(plan),
    createdAt: new Date(plan.createdAt),
  });
  // По одной строке — seq растёт в порядке participantIds.
  for (const userId of plan.participantIds) {
    await tx
      .insert(planParticipants)
      .values(memberRow(plan, userId, new Date(now)));
  }
};

const swipeOf = (plan: PlanSession, userId: string, activityId: string) =>
  plan.swipes[userId]?.[activityId];

// Записать разницу между планом до и после действия.
export const savePlan = async (
  tx: Tx,
  before: PlanSession,
  after: PlanSession,
  now: number,
) => {
  await tx.update(plans).set(planColumns(after)).where(eq(plans.id, after.id));

  const at = new Date(now);
  // Вышел из плана (Q04) — строки участника нет.
  for (const userId of before.participantIds) {
    if (after.participantIds.includes(userId)) continue;
    await tx
      .delete(planParticipants)
      .where(
        and(
          eq(planParticipants.planId, after.id),
          eq(planParticipants.userId, userId),
        ),
      );
  }
  for (const userId of after.participantIds) {
    const row = memberRow(after, userId, at);
    if (!before.participantIds.includes(userId)) {
      await tx.insert(planParticipants).values(row);
      continue;
    }
    const wasReady = before.readyIds.includes(userId);
    const wasFinished = before.finishedIds.includes(userId);
    if (wasReady !== row.ready || wasFinished !== row.finished) {
      await tx
        .update(planParticipants)
        .set({ ready: row.ready, finished: row.finished })
        .where(
          and(
            eq(planParticipants.planId, after.id),
            eq(planParticipants.userId, userId),
          ),
        );
    }
  }

  const people = new Set([
    ...Object.keys(before.swipes),
    ...Object.keys(after.swipes),
  ]);
  for (const userId of people) {
    const ids = new Set([
      ...Object.keys(before.swipes[userId] ?? {}),
      ...Object.keys(after.swipes[userId] ?? {}),
    ]);
    for (const activityId of ids) {
      const old = swipeOf(before, userId, activityId);
      const next = swipeOf(after, userId, activityId);
      if (old === next) continue;
      const where = and(
        eq(planSwipes.planId, after.id),
        eq(planSwipes.userId, userId),
        eq(planSwipes.activityId, activityId),
      );
      if (next === undefined) {
        await tx.delete(planSwipes).where(where);
      } else {
        await tx
          .insert(planSwipes)
          .values({ planId: after.id, userId, activityId, decision: next, at })
          .onConflictDoUpdate({
            target: [
              planSwipes.planId,
              planSwipes.userId,
              planSwipes.activityId,
            ],
            set: { decision: next, at },
          });
      }
    }
  }

  const votesChanged =
    JSON.stringify(Object.entries(before.votes).sort()) !==
    JSON.stringify(Object.entries(after.votes).sort());
  if (votesChanged) {
    await tx.delete(planVotes).where(eq(planVotes.planId, after.id));
    const rows = Object.entries(after.votes).map(([userId, activityId]) => ({
      planId: after.id,
      userId,
      activityId,
    }));
    if (rows.length > 0) await tx.insert(planVotes).values(rows);
  }
};

// ── Ответы: те же PlanView и PlanSummary, что у мока ────────────────

const PREVIEW_SIZE = 3;

// Свои занятия по id: строки custom_activities.
export const readCustomActivities = async (
  tx: Tx,
  ids: readonly string[],
): Promise<Map<string, Activity & { createdBy?: string }>> => {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select()
    .from(customActivities)
    .where(inArray(customActivities.id, [...ids]));
  return new Map(
    rows.map((row) => [
      row.id,
      { ...(row.activity as Activity), createdBy: row.createdBy },
    ]),
  );
};

// Участники с именем и цветом. Удалённый профиль — строка без имени (§3.4).
export const participantsOf = async (
  tx: Tx,
  plan: PlanSession,
): Promise<PlanParticipant[]> => {
  if (plan.participantIds.length === 0) return [];
  const rows = await tx
    .select({ id: users.id, name: users.name, avatarColor: users.avatarColor })
    .from(users)
    .where(inArray(users.id, plan.participantIds));
  const byId = new Map(rows.map((row) => [row.id, row]));
  return plan.participantIds.flatMap((id) => {
    const row = byId.get(id);
    return row
      ? [
          {
            id,
            name: row.name ?? "",
            avatarColor: row.avatarColor as User["avatarColor"],
            // Ботов на сервере нет (§7).
            isBot: false,
          },
        ]
      : [];
  });
};

export type PlanActivities = {
  // Свои занятия плана, в порядке customActivityIds.
  custom: Activity[];
  catalog: readonly Activity[];
};

export const activitiesFor = async (
  tx: Tx,
  plan: PlanSession,
  catalog: readonly Activity[],
): Promise<PlanActivities> => {
  const byId = await readCustomActivities(tx, plan.customActivityIds);
  return {
    catalog,
    custom: plan.customActivityIds.flatMap((id) => {
      const activity = byId.get(id);
      return activity ? [activity] : [];
    }),
  };
};

// Из чего собирается колода: свои занятия (в обход фильтров) и каталог по
// фильтрам плана — не больше размера колоды, из разных категорий (X05).
// Выбор одинаков при каждом чтении: лобби показывает ровно то, что
// попадёт в колоду.
export const poolOf = (plan: PlanSession, source: PlanActivities): Activity[] =>
  pickPlanDeck(
    source.custom,
    source.catalog.filter((activity) =>
      matchesPlanFilters(activity, plan.filters),
    ),
    plan.filters.deckSize ?? null,
    plan.id,
  );

// Колода в общем порядке; пропавшие из каталога занятия просто не попадают
// в выдачу.
export const deckOf = (
  plan: PlanSession,
  source: PlanActivities,
): Activity[] => {
  const byId = new Map<string, Activity>(
    [...source.catalog, ...source.custom].map((activity) => [
      activity.id,
      activity,
    ]),
  );
  return plan.deck.flatMap((id) => {
    const activity = byId.get(id);
    return activity ? [activity] : [];
  });
};

const activitiesOf = (plan: PlanSession, source: PlanActivities) =>
  plan.deck.length > 0 ? deckOf(plan, source) : poolOf(plan, source);

export const viewOf = async (
  tx: Tx,
  plan: PlanSession,
  source: PlanActivities,
): Promise<PlanView> => ({
  plan,
  participants: await participantsOf(tx, plan),
  activities: activitiesOf(plan, source),
});

export const summaryOf = async (
  tx: Tx,
  plan: PlanSession,
  source: PlanActivities,
): Promise<PlanSummary> => {
  const activities = activitiesOf(plan, source);
  const decided = plan.decision
    ? activities.find((activity) => activity.id === plan.decision?.activityId)
    : undefined;
  const preview = decided
    ? [decided, ...activities.filter((activity) => activity !== decided)]
    : activities;
  return {
    plan,
    participants: await participantsOf(tx, plan),
    preview: preview.slice(0, PREVIEW_SIZE),
    activityCount: activities.length,
  };
};
