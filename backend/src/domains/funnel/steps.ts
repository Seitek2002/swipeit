import { toDateKey } from "@swipeit/core/format";
import { and, eq, sql } from "drizzle-orm";

import type { Tx } from "../../context";
import { funnelDaily, users } from "../../db/schema";

// Воронка (auto-tasks P09, PRD §4 «найти, что в идее не работает»): где
// люди отваливаются. Шаги планов и Санты подключают B10 и B11.
export const FUNNEL_STEPS = [
  "profile_created",
  "first_swipe",
  "share_unlocked",
  "wishlist_shared",
  "guest_opened",
  "reservation_created",
  "guest_first_swipe",
  "plan_created",
  "plan_decided",
  "santa_drawn",
  "ward_empty",
] as const;

export type FunnelStep = (typeof FUNNEL_STEPS)[number];

// Шаг пройден впервые — +1 к счётчику дня, в той же транзакции, что и
// действие. Повтор у того же человека — ничего. В funnel_daily нет ни id, ни
// имён: какие шаги прошёл человек, знает только его строка users.
export const reachStep = async (
  tx: Tx,
  userId: string,
  step: FunnelStep,
  now: number,
): Promise<boolean> => {
  const [first] = await tx
    .update(users)
    .set({ funnelSteps: sql`array_append(${users.funnelSteps}, ${step})` })
    .where(
      and(eq(users.id, userId), sql`not (${step} = any(${users.funnelSteps}))`),
    )
    .returning({ id: users.id });
  if (!first) return false;
  await tx
    .insert(funnelDaily)
    .values({ day: toDateKey(now), step, count: 1 })
    .onConflictDoUpdate({
      target: [funnelDaily.day, funnelDaily.step],
      set: { count: sql`${funnelDaily.count} + 1` },
    });
  return true;
};

// Прошёл ли человек шаг (без записи).
export const hasStep = async (tx: Tx, userId: string, step: FunnelStep) => {
  const [row] = await tx
    .select({ id: users.id })
    .from(users)
    .where(and(eq(users.id, userId), sql`${step} = any(${users.funnelSteps})`))
    .limit(1);
  return Boolean(row);
};
