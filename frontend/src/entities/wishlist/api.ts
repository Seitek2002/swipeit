"use client";

import { useQuery } from "@tanstack/react-query";

import {
  getMyReservations,
  getMyWishlist,
  getOpenedWishlists,
  getUserWishlist,
  reservationKeys,
  wishlistKeys,
} from "@/shared/api";
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

// Мои брони у друзей — «Я дарю» (auto-tasks P02). Один запрос и кэш на
// раздел в «Друзьях», строку на «Вишлисте» и счётчик в профиле (W04).
export const useMyReservations = () => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: reservationKeys.mine(),
    queryFn: () => getMyReservations(),
    enabled: mounted && Boolean(userId),
  });
};

// Чьи вишлисты открывал по ссылке — «Открывал по ссылке» на «Друзьях»
// (UX-аудит X03): иначе гость, собравший свой вишлист, искал бы ссылку
// друга в чате.
export const useOpenedWishlists = () => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: wishlistKeys.opened(),
    queryFn: getOpenedWishlists,
    enabled: mounted && Boolean(userId),
  });
};

// Сколько подарков я ещё дарю: открытые брони.
export const useGivingCount = () =>
  (useMyReservations().data ?? []).filter((item) => !item.closed).length;

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
