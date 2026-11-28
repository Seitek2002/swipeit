import type { PlanSession } from "../api/plans/types";

// Как план закрывается без всех (auto-tasks P04, auto-tasks-ux-5 Y02): одна
// функция на мок и сервер — иначе «Показать итоги сейчас» и дедлайн «До
// даты» считали бы итоги по разным правилам.

// Сколько должны долистать, чтобы были итоги без остальных: с одним
// «совпадение» — это просто его лайки.
export const MIN_FINISHED_TO_CLOSE = 2;

// «Продлить на сутки» и «Добавить ещё занятий» после даты — новый круг на
// сутки от «сейчас».
export const EXTRA_ROUND_MS = 24 * 3600_000;

type Members = Pick<PlanSession, "finishedIds" | "participantIds">;

// Нынешние участники, которые долистали колоду.
export const finishedParticipants = (plan: Members): string[] =>
  plan.participantIds.filter((id) => plan.finishedIds.includes(id));

export const allFinished = (plan: Members): boolean =>
  plan.participantIds.every((id) => plan.finishedIds.includes(id));

// Закрыть план по дате «До даты» (планировщик). Долистали все — обычные
// итоги. Есть отстающие — как «Показать итоги сейчас»: считаем только
// долиставших (closedEarly), а timedOut говорит экрану, что ждать перестала
// дата, а не организатор. Долистал меньше двоих — итогов нет: экран
// предлагает «Продлить на сутки» (isTimedOutWithoutResults).
export const closeAtDeadline = (plan: PlanSession): void => {
  plan.status = "results";
  plan.votes = {};
  if (allFinished(plan)) {
    delete plan.closedEarly;
    delete plan.timedOut;
  } else {
    plan.closedEarly = true;
    plan.timedOut = true;
  }
};

type TimedOutInput = Members &
  Pick<PlanSession, "status"> &
  Partial<Pick<PlanSession, "timedOut">>;

// Время вышло, а итоги считать не по кому: долистал один или никто.
// «Совпадений нет» тут было бы неправдой — компания просто не успела.
export const isTimedOutWithoutResults = (plan: TimedOutInput): boolean =>
  plan.status === "results" &&
  Boolean(plan.timedOut) &&
  finishedParticipants(plan).length < MIN_FINISHED_TO_CLOSE;

// Почему «Продлить на сутки» нельзя; null — можно. Продлевают только план
// «До даты», закрытый датой, пока решения нет.
export const extendRefusal = (
  plan: Pick<PlanSession, "mode" | "status"> &
    Partial<Pick<PlanSession, "timedOut">>,
): null | string => {
  if (plan.mode !== "deadline") return "Продлить можно только план «До даты»";
  if (plan.status === "lobby") return "План ещё не начался";
  if (plan.status === "decided") return "Решение уже принято";
  if (plan.status === "results" && !plan.timedOut) {
    return "Все уже долистали — итоги готовы";
  }
  return null;
};

// «Продлить на сутки»: новая дата, план снова в колоде, итоги — заново по
// всем. Долиставшие остаются долиставшими: колода та же. Свайп идёт и дата
// впереди — ничего не меняет (двойное нажатие). false — план не изменился.
export const extendDeadline = (plan: PlanSession, now: number): boolean => {
  if (plan.status === "swiping" && Date.parse(plan.deadline ?? "") > now) {
    return false;
  }
  plan.status = "swiping";
  plan.deadline = new Date(now + EXTRA_ROUND_MS).toISOString();
  plan.votes = {};
  delete plan.closedEarly;
  delete plan.timedOut;
  return true;
};
