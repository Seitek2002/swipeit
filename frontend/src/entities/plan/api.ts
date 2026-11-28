"use client";

import { useQuery } from "@tanstack/react-query";

import { getPlan, getPlans, planKeys } from "@/shared/api";
import { useMounted } from "@/shared/lib/dom";
import { useSessionStore } from "@/shared/store";

// Мои планы: организую или участвую. Обновляются по событию plans.
export const usePlans = () => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: planKeys.list(),
    queryFn: getPlans,
    enabled: mounted && Boolean(userId),
  });
};

// Экран приглашения читает план и без профиля: сервер отдаёт гостю превью
// без свайпов и голосов (UX-аудит X07). Событий у приглашений нет
// (BACKEND.md §5) — они перечитывают план сами (refetchInterval).
export const usePlan = (
  id: string | undefined,
  {
    guest = false,
    refetchInterval,
  }: { guest?: boolean; refetchInterval?: number } = {},
) => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: planKeys.detail(id ?? ""),
    queryFn: () => getPlan(id ?? ""),
    enabled: mounted && (guest || Boolean(userId)) && Boolean(id),
    refetchInterval,
  });
};
