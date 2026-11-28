// «Вишлист готов» в Тайном Санте (auto-tasks-ux-6 Z03) — одно правило для
// сервера, мока и экранов: строка участника, подсказка «Собери вишлист»,
// подтверждение жеребьёвки, «Напомнить про вишлист», напоминание бота.
// Санте важно не «есть ли хоть одно желание», а «есть ли что купить в
// бюджете игры»: желания дороже бюджета ему не помогут.

// Столько желаний в бюджете — вишлист готов (тот же порог, что у идей P05
// и ward_empty).
export const SANTA_WISHES_ENOUGH = 3;

// ready — 3 и больше в бюджете; few — вишлист есть, но в бюджете 0–2;
// none — вишлиста нет совсем. Все желания дороже бюджета — это «мало в
// бюджете», а не «без вишлиста» (T28): вишлист у человека есть, ему нужно
// добавить желаний подешевле.
export type SantaWishlistStatus = "few" | "none" | "ready";

export const santaWishlistStatus = ({
  hasWishlist,
  inBudget,
}: {
  // Есть хотя бы одно активное желание.
  hasWishlist: boolean;
  // Сколько из них в бюджете игры (countInSantaBudget).
  inBudget: number;
}): SantaWishlistStatus => {
  if (inBudget >= SANTA_WISHES_ENOUGH) return "ready";
  return hasWishlist || inBudget > 0 ? "few" : "none";
};

// Желание в бюджете — по нижней цене; цена не указана — не в бюджете: Санта
// не поймёт, уложится ли.
export const inSantaBudget = (priceMin: null | number, budget: number) =>
  priceMin !== null && priceMin <= budget;

export const countInSantaBudget = (
  pricesMin: ReadonlyArray<null | number>,
  budget: number,
) => pricesMin.filter((price) => inSantaBudget(price, budget)).length;
