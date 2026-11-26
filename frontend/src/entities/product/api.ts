"use client";

import { useQuery } from "@tanstack/react-query";

import {
  type ProductFilters,
  catalogKeys,
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
