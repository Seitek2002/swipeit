import type { SantaView } from "@/shared/api";

// Жеребьёвка по дате не прошла (R08) — тексты для экрана игры и списка.
// Пока игра не изменилась, по дате её больше не пробуют; вступление,
// выход, «Убрать» и правка снимают отметку, и планировщик пробует снова.

export const DRAW_FAILED_STATUS = "Жеребьёвка не прошла";

// Под крупной строкой «Жеребьёвка не прошла» у участника и позванного. С
// именем — в скобках, чтобы не склонять (Z02): организатора знают не все,
// а после «Передать роль» он меняется.
export const DRAW_FAILED_WAIT = "Ждём организатора";

const drawFailedWait = (owner?: string) =>
  owner ? `${DRAW_FAILED_WAIT} (${owner})` : DRAW_FAILED_WAIT;

type FailedView = Pick<SantaView, "drawFailed" | "role"> & {
  game: Pick<SantaView["game"], "status">;
};

// Отметка есть и жеребьёвки ещё не было.
export const drawFailedNow = (view: Pick<FailedView, "drawFailed" | "game">) =>
  view.game.status === "gathering" && Boolean(view.drawFailed);

// Подпись под крупной «Жеребьёвка не прошла» (Y09): у организатора — две
// строки, почему и что делать; ссылку «Изменить игру» экран ставит сам
// следом. Причина — та же, что в drawIssue на момент неудачи («Нужно хотя
// бы 3 участника — позови ещё друзей»): берём её до тире, совет — свой.
// null — показывать нечего. owner — имя организатора для остальных.
export const drawFailedNote = (
  view: FailedView,
  owner?: string,
): null | string => {
  if (!drawFailedNow(view)) return null;
  if (view.role !== "owner") return drawFailedWait(owner);
  const reason = (view.drawFailed?.reason ?? "").trim().replace(/\.$/, "");
  const head = reason.split(" — ")[0]?.trim() ?? "";
  if (!head) return "Поменяй дату";
  const advice = /^Нужно хотя бы/.test(head)
    ? "Позови друзей или поменяй дату"
    : "Убери исключение или поменяй дату";
  return `${head}. ${advice}`;
};
