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
