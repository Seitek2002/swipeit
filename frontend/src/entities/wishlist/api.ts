"use client";

import { useQuery } from "@tanstack/react-query";

import { getMyWishlist, wishlistKeys } from "@/shared/api";
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
    likeCount: data?.likeCount ?? 0,
    shareUnlocked: Boolean(data?.meta.shareUnlockedAt),
    isLoaded: Boolean(data),
  };
};
