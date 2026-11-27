import type { Activity } from "../api/catalog/types";
import type { PlanFilters } from "../api/plans/types";

// Занятие подходит под фильтры плана. Бюджет — пересечение диапазонов, как у
// подарков в ленте (TECH_SPEC §6 «Алгоритм ленты»): занятие «500–1 500 сом»
// подходит под «до 1 000». Общая для мока и сервера (BACKEND.md B06).
export const matchesPlanFilters = (
  activity: Activity,
  filters: PlanFilters,
): boolean => {
  const { categories, budgetPerPerson } = filters;
  if (categories.length > 0 && !categories.includes(activity.category)) {
    return false;
  }
  if (activity.pricePerPersonMax < budgetPerPerson.min) return false;
  return (
    budgetPerPerson.max === null ||
    activity.pricePerPersonMin <= budgetPerPerson.max
  );
};
