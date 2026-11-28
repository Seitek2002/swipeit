import type { SantaSummary } from "@/shared/api";

// Подсказка «Собери вишлист, чтобы твоему Санте было проще» (PRD §7.2 P1,
// auto-tasks-pm-3 R06): моя игра до или после жеребьёвки, где у меня меньше
// трёх желаний в бюджете игры (тот же порог, что у идей P05 и ward_empty).
// Из нескольких — с самой ранней датой обмена.
export const SANTA_WISHES_ENOUGH = 3;

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
    .filter((summary) => {
      const inBudget = wishPrices.filter(
        (price) => price !== null && price <= summary.game.budget,
      ).length;
      return inBudget < SANTA_WISHES_ENOUGH;
    })
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
