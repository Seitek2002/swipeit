import { toDateKey } from "@swipeit/core/format";
import { daysUntil } from "@swipeit/core/logic/dates";
import { SANTA_WISHES_ENOUGH } from "@swipeit/core/logic/santa-wishlist";
import { and, eq, gt, isNull, lte } from "drizzle-orm";

import type { ServerContext } from "../../context";
import { santaGames } from "../../db/schema";
import { botRecipients, enqueueNotifications } from "../notifications/queue";
import { NOTIFICATION_TEXTS } from "../notifications/texts";
import { wishesInBudget } from "./handlers";
import { loadGame, wardIdOf } from "./store";

// Напоминания Санты ботом по времени (auto-tasks-pm-4 S10) — ставит
// планировщик (B13), каждый проход. Повтор прохода ничего не добавляет:
// ключ очереди — игра, человек и дата, к которой напоминаем.

const DAY = 86_400_000;
// Напоминаем днём по Бишкеку: в полночь «до обмена 3 дня» никому не нужно.
const REMIND_FROM_HOUR = 10;
const REMIND_TO_HOUR = 21;
const EXCHANGE_SOON_DAYS = 3;

export const isRemindHour = (now: number) => {
  const hour = new Date(now).getHours();
  return hour >= REMIND_FROM_HOUR && hour < REMIND_TO_HOUR;
};

// Завтра жеребьёвка по дате — вступившим, у кого меньше трёх желаний в
// бюджете игры: их Санте будет из чего выбрать.
const remindDrawTomorrow = async (ctx: ServerContext, now: number) => {
  const tomorrow = toDateKey(now + DAY);
  const rows = await ctx.tx
    .select({ id: santaGames.id })
    .from(santaGames)
    .where(
      and(
        eq(santaGames.status, "gathering"),
        gt(santaGames.drawAt, new Date(now)),
        lte(santaGames.drawAt, new Date(now + 2 * DAY)),
        isNull(santaGames.drawFailedAt),
      ),
    );
  let queued = 0;
  for (const { id } of rows) {
    const game = await loadGame(ctx.tx, id, { lock: false });
    if (!game.drawAt || toDateKey(Date.parse(game.drawAt)) !== tomorrow) {
      continue;
    }
    const few: string[] = [];
    for (const userId of await botRecipients(ctx.tx, game.participantIds)) {
      if (
        (await wishesInBudget(ctx, userId, game.budget)) < SANTA_WISHES_ENOUGH
      ) {
        few.push(userId);
      }
    }
    const drawAt = game.drawAt;
    queued += await enqueueNotifications(
      ctx.tx,
      {
        kind: "santa_draw_tomorrow",
        refId: game.id,
        text: NOTIFICATION_TEXTS.santaDrawTomorrow(game.title),
        dedupeKey: (userId) =>
          `santa_draw_tomorrow:${game.id}:${userId}:${drawAt}`,
        userIds: few,
      },
      now,
    );
  }
  return queued;
};

// За 3 дня до обмена — кто не отметил «Я купил подарок». Разыграли позже —
// напомним, сколько осталось (1–3 дня), но один раз на дату обмена.
const remindExchangeSoon = async (ctx: ServerContext, now: number) => {
  const today = toDateKey(now);
  const rows = await ctx.tx
    .select({ id: santaGames.id })
    .from(santaGames)
    .where(
      and(
        eq(santaGames.status, "drawn"),
        gt(santaGames.exchangeDate, today),
        lte(santaGames.exchangeDate, toDateKey(now + EXCHANGE_SOON_DAYS * DAY)),
      ),
    );
  let queued = 0;
  for (const { id } of rows) {
    const game = await loadGame(ctx.tx, id, { lock: false });
    const days = daysUntil(game.exchangeDate, now);
    if (days < 1 || days > EXCHANGE_SOON_DAYS) continue;
    const notBought: string[] = [];
    const waiting = game.participantIds.filter(
      (userId) => !game.boughtIds.includes(userId),
    );
    for (const userId of await botRecipients(ctx.tx, waiting)) {
      // Подопечный ушёл и пары нет (Q05) — в этой игре человек не дарит.
      if (!(await wardIdOf(ctx.tx, game.id, userId))) continue;
      notBought.push(userId);
    }
    queued += await enqueueNotifications(
      ctx.tx,
      {
        kind: "santa_exchange_soon",
        refId: game.id,
        text: NOTIFICATION_TEXTS.santaExchangeSoon(game.title, days),
        dedupeKey: (userId) =>
          `santa_exchange_soon:${game.id}:${userId}:${game.exchangeDate}`,
        userIds: notBought,
      },
      now,
    );
  }
  return queued;
};

export const remindSantaMembers = async (ctx: ServerContext) => {
  const now = ctx.clock.now();
  if (!isRemindHour(now)) return 0;
  return (
    (await remindDrawTomorrow(ctx, now)) + (await remindExchangeSoon(ctx, now))
  );
};
