import type { SantaView } from "@/entities/santa-game";

import { pluralize } from "@/shared/lib/format";

// «Письмо не открыто N дней» у организатора (auto-tasks-pm-4 S04): «ещё не
// заходил» и «телефон потерял профиль» снаружи одинаковы, но через 2 дня
// после жеребьёвки это уже повод спросить человека — а если профиль
// потерян, убрать его, чтобы подопечного взял другой Санта.
const DAY_MS = 24 * 60 * 60 * 1000;
export const STALE_LETTER_DAYS = 2;

// Вступившие с невскрытым письмом, у кого с жеребьёвки прошло 2 полных дня
// и больше: id → сколько дней. До жеребьёвки — пусто.
export const staleLetters = (
  view: Pick<SantaView, "game" | "members">,
  now: number,
): Map<string, number> => {
  const result = new Map<string, number>();
  const { drawnAt, status } = view.game;
  if (status !== "drawn" || !drawnAt) return result;
  const days = Math.floor((now - Date.parse(drawnAt)) / DAY_MS);
  if (!(days >= STALE_LETTER_DAYS)) return result;
  for (const member of view.members) {
    if (member.joined && !member.opened) result.set(member.id, days);
  }
  return result;
};

// Подпись в строке участника: «письмо не открыто 3 дня».
export const sealedLetterText = (days?: number) =>
  days === undefined
    ? "письмо не открыто"
    : `письмо не открыто ${pluralize(days, ["день", "дня", "дней"])}`;

// Один раз над списком, если такие есть (кроме самого организатора).
export const STALE_LETTERS_HINT =
  "Кто-то давно не открывает письмо? Спроси его. Если телефон потерял профиль — убери его из игры, подопечного возьмёт другой Санта";
