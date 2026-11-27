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

export const usePlan = (id: string | undefined) => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: planKeys.detail(id ?? ""),
    queryFn: () => getPlan(id ?? ""),
    enabled: mounted && Boolean(userId) && Boolean(id),
  });
};
