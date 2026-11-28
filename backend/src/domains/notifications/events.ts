import type { Tx } from "../../context";
import { enqueueNotifications } from "./queue";
import { NOTIFICATION_TEXTS } from "./texts";

// Какие события ставят какие уведомления (auto-tasks-pm-4 S10). Зовут
// обработчики Санты и планов в своей транзакции; напоминания по времени —
// santa/reminders.ts из планировщика.

type Game = { id: string; participantIds: readonly string[]; title: string };

// Жеребьёвка прошла (кнопкой или по дате) — всем вступившим. Жеребьёвка в
// игре одна, поэтому ключ — игра и человек.
export const notifySantaDrawn = (tx: Tx, game: Game, now: number) =>
  enqueueNotifications(
    tx,
    {
      kind: "santa_drawn",
      refId: game.id,
      text: NOTIFICATION_TEXTS.santaDrawn(game.title),
      dedupeKey: (userId) => `santa_drawn:${game.id}:${userId}`,
      userIds: game.participantIds,
    },
    now,
  );

// Новое письмо после «Убрать» или удаления профиля (R05, Q05) — новому
// Санте. Метка — время события: кого убрали, в ключ не идёт.
export const notifySantaNewLetter = (
  tx: Tx,
  game: { id: string; title: string },
  santaId: string,
  now: number,
) =>
  enqueueNotifications(
    tx,
    {
      kind: "santa_new_letter",
      refId: game.id,
      text: NOTIFICATION_TEXTS.santaNewLetter(game.title),
      dedupeKey: (userId) => `santa_new_letter:${game.id}:${userId}:${now}`,
      userIds: [santaId],
    },
    now,
  );

// Жеребьёвка по дате не прошла (R08) — организатору, один раз на отметку.
export const notifySantaDrawFailed = (
  tx: Tx,
  game: { id: string; ownerId: string; title: string },
  failedAt: string,
  now: number,
) =>
  enqueueNotifications(
    tx,
    {
      kind: "santa_draw_failed",
      refId: game.id,
      text: NOTIFICATION_TEXTS.santaDrawFailed(game.title),
      dedupeKey: (userId) =>
        `santa_draw_failed:${game.id}:${userId}:${failedAt}`,
      userIds: [game.ownerId],
    },
    now,
  );

type Plan = {
  deadline?: string;
  id: string;
  mode: string;
  participantIds: readonly string[];
  status: string;
  title: string;
};

// Итоги плана «До даты» готовы — участникам, кроме того, кто их только что
// увидел сам (последний долиставший, «Показать итоги сейчас»). По дате
// плана: «Продлить на сутки» — новая дата, новые итоги.
export const notifyPlanResults = (
  tx: Tx,
  before: Plan,
  after: Plan,
  now: number,
  except: null | string = null,
) => {
  if (after.mode !== "deadline") return Promise.resolve(0);
  if (before.status !== "swiping" || after.status !== "results") {
    return Promise.resolve(0);
  }
  return enqueueNotifications(
    tx,
    {
      kind: "plan_results",
      refId: after.id,
      text: NOTIFICATION_TEXTS.planResults(after.title),
      dedupeKey: (userId) =>
        `plan_results:${after.id}:${after.deadline ?? ""}:${userId}`,
      userIds: after.participantIds.filter((id) => id !== except),
    },
    now,
  );
};
