"use client";

import { useQuery } from "@tanstack/react-query";

import { getMyWishlist, getUserWishlist, wishlistKeys } from "@/shared/api";
import { useMounted } from "@/shared/lib/dom";
import { useSessionStore } from "@/shared/store";

export const useMyWishlist = () => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: wishlistKeys.mine(),
    queryFn: getMyWishlist,
    enabled: mounted && Boolean(userId),
  });
};

// Сводка для ленты прогресса и бейджа таба «Вишлист».
export const useWishlistSummary = () => {
  const { data } = useMyWishlist();
  return {
    activeCount:
      data?.items.filter((item) => item.status === "active").length ?? 0,
    // Желаний в «Хочу» (из ленты и свои) — порог отправки (TECH_SPEC §6).
    wishCount: data?.wishCount ?? 0,
    shareUnlocked: Boolean(data?.meta.shareUnlockedAt),
    isLoaded: Boolean(data),
  };
};

// Вишлист друга в гостевом виде (DESIGN.md §8.9): только активные желания.
export const useUserWishlist = (userId: string | undefined) => {
  const mounted = useMounted();
  return useQuery({
    queryKey: wishlistKeys.user(userId ?? ""),
    queryFn: () => getUserWishlist(userId ?? ""),
    enabled: mounted && Boolean(userId),
  });
};
