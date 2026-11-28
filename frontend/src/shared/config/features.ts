// Несколько вишлистов (docs/progress/spec-multi-wishlists.md) включаются
// переключателем — решение владельца 28.11 вместо отдельной ветки: демо
// получает их сразу, прод с офисным Сантой — когда владелец включит.
// NEXT_PUBLIC_MULTI_WISHLISTS: «1» — включено, «0» — выключено; нет
// переменной — решает режим (в демо включено, в remote выключено).
export const multiWishlistsFlag = (): boolean | null => {
  const raw = process.env.NEXT_PUBLIC_MULTI_WISHLISTS?.trim();
  if (raw === "1") return true;
  if (raw === "0") return false;
  return null;
};
