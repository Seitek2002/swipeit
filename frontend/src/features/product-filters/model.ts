"use client";

import { useEffect, useState } from "react";

import { keepPreviousData, useQuery } from "@tanstack/react-query";

import type { ProductFilters } from "@/entities/product";

import { catalogKeys, getCatalogCount } from "@/shared/api";
import {
  AUDIENCE_LABELS,
  CATEGORY_LABELS,
  type CategoryId,
  MARKETPLACE_LABELS,
  type MarketplaceId,
  shopLabel,
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
  // «Показывать подарки: для неё / для него» (DESIGN.md §8.2); «всем» —
  // не фильтр, чипа нет.
  ...(filters.audience && filters.audience !== "all"
    ? [
        {
          id: "audience",
          label: AUDIENCE_LABELS[filters.audience],
          remove: (current: ProductFilters) => ({
            ...current,
            audience: undefined,
          }),
        },
      ]
    : []),
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
  ...(filters.shops ?? []).map((host) => ({
    id: `shop:${host}`,
    label: shopLabel(host),
    remove: (current: ProductFilters) => {
      const shops = (current.shops ?? []).filter((item) => item !== host);
      return { ...current, shops: shops.length > 0 ? shops : undefined };
    },
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

const joinAnd = (items: string[]) =>
  items.length <= 1
    ? (items[0] ?? "")
    : `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;

// Условия ссылки-фильтра словами (DESIGN.md §8.6): «в категориях Техника и
// Спорт, до 5 000 сом». При скрытых ценах бюджет не называем.
export const describeFilters = (
  filters: ProductFilters,
  { hidePrices = false }: { hidePrices?: boolean } = {},
): string => {
  const parts: string[] = [];
  // «Для неё, в категории Красота» (G05): кому — первым.
  if (filters.audience && filters.audience !== "all") {
    parts.push(AUDIENCE_LABELS[filters.audience]);
  }
  const categories = filters.categories.map(
    (category: CategoryId) => CATEGORY_LABELS[category],
  );
  if (categories.length === 1) parts.push(`в категории ${categories[0]}`);
  if (categories.length > 1) parts.push(`в категориях ${joinAnd(categories)}`);
  if (!hidePrices && !isDefaultBudget(filters)) {
    parts.push(formatBudget(filters.budget.min, filters.budget.max));
  }
  const stores = [
    ...filters.marketplaces.map(
      (marketplace: MarketplaceId) => MARKETPLACE_LABELS[marketplace],
    ),
    ...(filters.shops ?? []).map(shopLabel),
  ];
  if (stores.length > 0) parts.push(`из магазинов ${joinAnd(stores)}`);
  return parts.length > 0 ? parts.join(", ") : "любые подарки из каталога";
};
