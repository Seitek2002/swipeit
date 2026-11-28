"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import {
  type ProductFilters,
  catalogKeys,
  getCatalogStores,
  getFeed,
  getProduct,
} from "@/shared/api";
import { useMounted } from "@/shared/lib/dom";
import { useSessionStore } from "@/shared/store";

// Первая порция ленты. Полная колода с дозагрузкой — в widgets/gift-deck (T07).
export const useFeedPage = (filters: ProductFilters, context = "self") => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: catalogKeys.feed(context, filters),
    queryFn: () => getFeed({ filters, context }),
    enabled: mounted && Boolean(userId),
  });
};

// Товар по id — для мини-бирок вишлиста. Каталог в демо не меняется, поэтому
// кэш не устаревает.
export const useProduct = (id?: string) =>
  useQuery({
    queryKey: catalogKeys.product(id ?? ""),
    queryFn: () => getProduct(id ?? ""),
    enabled: Boolean(id),
    staleTime: Infinity,
  });

// Несколько товаров сразу — цены для фильтра «до 3 000 сом» в гостевом
// вишлисте (auto-tasks P10). Тот же кэш, что у useProduct.
export const useProducts = (ids: readonly string[]) =>
  useQueries({
    queries: ids.map((id) => ({
      queryKey: catalogKeys.product(id),
      queryFn: () => getProduct(id),
      staleTime: Infinity,
    })),
    combine: (results) =>
      new Map(
        results.flatMap((result) =>
          result.data ? [[result.data.id, result.data] as const] : [],
        ),
      ),
  });

// Магазины, где есть товары, — для чипов «Магазины» (UX-аудит M1). Каталог в
// демо не меняется, поэтому кеш не устаревает.
export const useCatalogStores = () => {
  const mounted = useMounted();
  return useQuery({
    queryKey: catalogKeys.stores(),
    queryFn: getCatalogStores,
    enabled: mounted,
    staleTime: Infinity,
  });
};
