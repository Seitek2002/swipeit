// Фильтр по бюджету в гостевом вишлисте (auto-tasks P10, PRD §6.2 «подарить
// в своём бюджете»): чипы «до 1 000 / 3 000 / 5 000 сом».

export const BUDGET_LIMITS = [1000, 3000, 5000] as const;
// Чипы — только у длинного вишлиста: из пяти желаний выбрать и так легко.
export const BUDGET_MIN_PRICED_ITEMS = 6;

export type BudgetLimit = (typeof BUDGET_LIMITS)[number];

// Желание влезает в бюджет по нижней цене; без цены — только во «Все».
export const fitsBudget = (
  priceMin: number | undefined,
  limit: BudgetLimit | null,
): boolean => limit === null || (priceMin !== undefined && priceMin <= limit);

// Какие чипы показать: нужен длинный вишлист с ценами, и в чипе должно быть
// хоть одно желание.
export const budgetChips = (
  prices: ReadonlyArray<number | undefined>,
): BudgetLimit[] => {
  const priced = prices.filter((price): price is number => price !== undefined);
  if (priced.length < BUDGET_MIN_PRICED_ITEMS) return [];
  return BUDGET_LIMITS.filter((limit) =>
    priced.some((price) => price <= limit),
  );
};
