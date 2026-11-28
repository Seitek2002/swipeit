import type { SantaView } from "@/shared/api";

// Жеребьёвка по дате не прошла (R08) — тексты для экрана игры и списка.
// Пока игра не изменилась, по дате её больше не пробуют; вступление,
// выход, «Убрать» и правка снимают отметку, и планировщик пробует снова.

export const DRAW_FAILED_STATUS = "Жеребьёвка не прошла";

export const DRAW_FAILED_WAIT =
  "Жеребьёвка по дате не прошла — ждём организатора";

type FailedView = Pick<SantaView, "drawFailed" | "role"> & {
  game: Pick<SantaView["game"], "status">;
};

// Отметка есть и жеребьёвки ещё не было.
export const drawFailedNow = (view: FailedView) =>
  view.game.status === "gathering" && Boolean(view.drawFailed);

// Подпись над «Провести жеребьёвку» у организатора и строка у остальных.
// Причина — та же, что в drawIssue на момент неудачи («Нужно хотя бы 3
// участника — позови ещё друзей»). null — показывать нечего.
export const drawFailedNote = (view: FailedView): null | string => {
  if (!drawFailedNow(view)) return null;
  if (view.role !== "owner") return DRAW_FAILED_WAIT;
  const reason = (view.drawFailed?.reason ?? "").trim().replace(/\.$/, "");
  const why = reason ? ` ${reason}.` : "";
  return `Жеребьёвка по дате не прошла.${why} Как только состав или исключения изменятся, попробуем снова — или поменяй дату в «Изменить игру»`;
};
