import {
  SANTA_WISHES_ENOUGH,
  type SantaMember,
  type SantaSummary,
  type SantaWishlistStatus,
  countInSantaBudget,
  santaWishlistStatus,
} from "@/shared/api";

export { SANTA_WISHES_ENOUGH, type SantaWishlistStatus };

// Вишлист участника до жеребьёвки (auto-tasks-ux-6 Z03): одно правило core
// для строки в списке, подсказки «Собери вишлист» и подтверждения
// жеребьёвки — по числу желаний в бюджете игры, которое считает сервер.
// Ответ без wishesInBudget (старый сервер) — по hasWishlist.
export const memberWishlistStatus = (
  member: Pick<SantaMember, "hasWishlist" | "wishesInBudget">,
): SantaWishlistStatus =>
  santaWishlistStatus(
    member.wishesInBudget ?? (member.hasWishlist ? SANTA_WISHES_ENOUGH : 0),
  );

// Подсказка «Собери вишлист, чтобы твоему Санте было проще» (PRD §7.2 P1,
// auto-tasks-pm-3 R06): моя игра до или после жеребьёвки, где у меня меньше
// трёх желаний в бюджете игры — то же правило, что у строки участника
// (Z03). Из нескольких — с самой ранней датой обмена.
export type SantaNudge = { budget: number; gameId: string; title: string };

export const santaWishlistNudge = (
  games: readonly SantaSummary[],
  meId: null | string,
  // Нижние цены моих активных желаний; null — цена не указана.
  wishPrices: ReadonlyArray<null | number>,
): null | SantaNudge => {
  if (!meId) return null;
  const mine = games
    .filter((summary) => summary.game.participantIds.includes(meId))
    .filter(
      (summary) =>
        santaWishlistStatus(
          countInSantaBudget(wishPrices, summary.game.budget),
        ) !== "ready",
    )
    .sort((a, b) => a.game.exchangeDate.localeCompare(b.game.exchangeDate));
  const first = mine[0];
  return first
    ? {
        gameId: first.game.id,
        title: first.game.title,
        budget: first.game.budget,
      }
    : null;
};
