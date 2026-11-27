"use client";

import { useQuery } from "@tanstack/react-query";

import { getSantaGame, getSantaGames, santaKeys } from "@/shared/api";
import { useMounted } from "@/shared/lib/dom";
import { useSessionStore } from "@/shared/store";

// Мои игры: организую, участвую или позван. Обновляются по событию santa.
export const useSantaGames = () => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: santaKeys.list(),
    queryFn: getSantaGames,
    enabled: mounted && Boolean(userId),
  });
};

export const useSantaGame = (id: string | undefined) => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: santaKeys.detail(id ?? ""),
    queryFn: () => getSantaGame(id ?? ""),
    enabled: mounted && Boolean(userId) && Boolean(id),
  });
};
