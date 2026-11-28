import { toDateKey } from "@swipeit/core/format";
import { and, eq, sql } from "drizzle-orm";

import type { Tx } from "../../context";
import { funnelDaily, plans, users } from "../../db/schema";

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
  // Петля (Q01): гость отправил свой вишлист; ссылка владельца дошла до
  // другого профиля; на вишлист владельца впервые забронировали.
  "guest_shared",
  "share_reached",
  "reservation_received",
  "plan_created",
  "plan_decided",
  "ward_empty",
  // Q02: «Выбери подарок сам» по человеку.
  "pick_created",
  "pick_opened",
  "pick_answered",
  // Q02: планы — вступил по человеку, старт и решение — по плану.
  "plan_joined",
  "plan_started_group",
  "plan_decided_group",
  // Q02: Санта по человеку; жеребьёвка — по игре.
  "santa_created",
  "santa_joined",
  "envelope_opened",
  "santa_bought",
  "santa_drawn_group",
  // Q02: исход вишлиста — подарили то, что бронировали.
  "gift_given_reserved",
  // Q03: цели PRD §4 и §7.4 в цифрах.
  "first_swipe_10s",
  "swipes_20",
  "share_with_birthday",
  // R06: участник игры Санты собрал три желания — его Санте есть из чего.
  "santa_member_wishlist",
  // R08: жеребьёвка по дате не прошла — один раз на отметку.
  "santa_draw_failed",
  // R05: организатор убрал участника после жеребьёвки.
  "santa_removed_after_draw",
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
  // Шаг другого человека (владельца вишлиста — Q01): его строку users может
  // держать его же запрос. Ждать её нельзя — два встречных запроса взяли бы
  // строки крест-накрест (deadlock). Занята — шаг засчитается в следующий
  // раз.
  { skipLocked = false }: { skipLocked?: boolean } = {},
): Promise<boolean> => {
  // Свой профиль команды (Q03) — ничего не считаем и не отмечаем: снял
  // пометку — шаг засчитается.
  const notYet = sql`not (${step} = any(${users.funnelSteps})) and not ${users.funnelInternal}`;
  const [first] = await tx
    .update(users)
    .set({ funnelSteps: sql`array_append(${users.funnelSteps}, ${step})` })
    .where(
      skipLocked
        ? sql`${users.id} = (
            select u.id from users u
            where u.id = ${userId} and not (${step} = any(u.funnel_steps))
              and not u.funnel_internal
            for update skip locked
          )`
        : and(eq(users.id, userId), notYet),
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

const countDay = (tx: Tx, step: FunnelStep, now: number) =>
  tx
    .insert(funnelDaily)
    .values({ day: toDateKey(now), step, count: 1 })
    .onConflictDoUpdate({
      target: [funnelDaily.day, funnelDaily.step],
      set: { count: sql`${funnelDaily.count} + 1` },
    });

// Свой профиль команды (Q03).
const isInternal = async (tx: Tx, userId: string) => {
  const [row] = await tx
    .select({ internal: users.funnelInternal })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return Boolean(row?.internal);
};

// Событие группы без человека (Q02): +1 к счётчику дня. Только для перехода,
// который случается один раз под FOR UPDATE строки (игра → drawn). Сделал
// его свой профиль команды — не считаем (Q03).
export const countEvent = async (
  tx: Tx,
  step: FunnelStep,
  now: number,
  initiatorId: string,
) => {
  if (await isInternal(tx, initiatorId)) return;
  await countDay(tx, step, now);
};

// Шаг плана — один раз на план (Q02), отметка в plans.funnel_steps; в
// счётчике дня id плана нет.
export const reachPlanStep = async (
  tx: Tx,
  planId: string,
  step: FunnelStep,
  now: number,
  initiatorId: string,
): Promise<boolean> => {
  if (await isInternal(tx, initiatorId)) return false;
  const [first] = await tx
    .update(plans)
    .set({ funnelSteps: sql`array_append(${plans.funnelSteps}, ${step})` })
    .where(
      and(eq(plans.id, planId), sql`not (${step} = any(${plans.funnelSteps}))`),
    )
    .returning({ id: plans.id });
  if (!first) return false;
  await countDay(tx, step, now);
  return true;
};

// Участник игры Санты дошёл до трёх активных желаний (R06). Зовут после
// того, как желание добавлено.
export const checkSantaMemberWishlist = async (
  tx: Tx,
  userId: string,
  now: number,
) => {
  const { rows } = await tx.execute<{ member: boolean; wishes: number }>(sql`
    select
      exists (
        select 1 from santa_members
        where user_id = ${userId} and state = 'joined'
      ) as member,
      (select count(*)::int from wishlist_items
        where owner_id = ${userId} and status = 'active'
          and deleted_at is null) as wishes
  `);
  const row = rows[0];
  if (row?.member && row.wishes >= 3) {
    await reachStep(tx, userId, "santa_member_wishlist", now);
  }
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
