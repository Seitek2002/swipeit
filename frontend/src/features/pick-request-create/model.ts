import type { ProductFilters } from "@/entities/product";

// «Скрыть цены от друга» обещает «только подарки в бюджете» — без верхней
// границы бюджета обещание пустое: друг увидел бы Dyson за 53 000 сом без
// цены (UX-аудит W02). Такую ссылку не собираем.
export const canHidePrices = (filters: ProductFilters) =>
  filters.budget.max !== null;

export const effectiveHidePrices = (
  filters: ProductFilters,
  hidePrices: boolean,
) => hidePrices && canHidePrices(filters);

// «Сколько можно выбрать» (просьба владельца): сколько угодно (null, по
// умолчанию), один, три или пять подарков. Больше пяти — почти как без
// лимита, а ряд чипов помещается в одну строку на 360 px.
export const PICK_LIMIT_OPTIONS: ReadonlyArray<null | number> = [null, 1, 3, 5];
