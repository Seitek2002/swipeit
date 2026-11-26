"use client";

import { useEffect, useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { ProductFilters } from "@/entities/product";

import { catalogKeys, getCatalogCount } from "@/shared/api";
import {
  CATEGORY_LABELS,
  type CategoryId,
  MARKETPLACE_LABELS,
  type MarketplaceId,
} from "@/shared/config";
import { formatBudget } from "@/shared/lib/format";
import { useSessionStore } from "@/shared/store";

export type FilterChip = {
  id: string;
  label: string;
  // Как убрать именно этот фильтр.
  remove: (filters: ProductFilters) => ProductFilters;
};

const isDefaultBudget = (filters: ProductFilters) =>
  filters.budget.min <= 0 && filters.budget.max === null;

// Чипы активных фильтров над колодой (DESIGN.md §8.2). Бюджет — один чип,
// категории и магазины — по чипу на каждый.
export const activeFilterChips = (filters: ProductFilters): FilterChip[] => [
  ...(isDefaultBudget(filters)
    ? []
    : [
        {
          id: "budget",
          label: formatBudget(filters.budget.min, filters.budget.max),
          remove: (current: ProductFilters) => ({
            ...current,
            budget: { min: 0, max: null },
          }),
        },
      ]),
  ...filters.categories.map((category: CategoryId) => ({
    id: `category:${category}`,
    label: CATEGORY_LABELS[category],
    remove: (current: ProductFilters) => ({
      ...current,
      categories: current.categories.filter((item) => item !== category),
    }),
  })),
  ...filters.marketplaces.map((marketplace: MarketplaceId) => ({
    id: `marketplace:${marketplace}`,
    label: MARKETPLACE_LABELS[marketplace],
    remove: (current: ProductFilters) => ({
      ...current,
      marketplaces: current.marketplaces.filter((item) => item !== marketplace),
    }),
  })),
];

export const countActiveFilters = (filters: ProductFilters) =>
  activeFilterChips(filters).length;

const DEBOUNCE_MS = 250;

// Живой счётчик «Показать 84 подарка»: пока тянут ползунок, запрос не
// уходит на каждый шаг — только после паузы 250 ms. Старое число остаётся на
// кнопке, пока считается новое.
export const useFilterCount = (
  filters: ProductFilters,
  {
    context = "self",
    enabled = true,
  }: { context?: string; enabled?: boolean } = {},
) => {
  const userId = useSessionStore((state) => state.activeUserId);
  const [debounced, setDebounced] = useState(filters);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(filters), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [filters]);

  return useQuery({
    queryKey: catalogKeys.count(context, debounced),
    queryFn: () => getCatalogCount({ filters: debounced, context }),
    placeholderData: keepPreviousData,
    // Только пока шторка открыта: иначе счётчик перечитывался бы после
    // каждого свайпа (событие swipes инвалидирует весь каталог).
    enabled: enabled && Boolean(userId),
  });
};
