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

// Экран приглашения читает игру и без профиля: сервер отдаёт гостю превью
// с ролью guest, без пар и «моего» (UX-аудит X07). Событий у приглашений
// нет (BACKEND.md §5) — они перечитывают игру сами (refetchInterval).
export const useSantaGame = (
  id: string | undefined,
  {
    guest = false,
    refetchInterval,
  }: { guest?: boolean; refetchInterval?: number } = {},
) => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: santaKeys.detail(id ?? ""),
    queryFn: () => getSantaGame(id ?? ""),
    enabled: mounted && (guest || Boolean(userId)) && Boolean(id),
    refetchInterval,
  });
};
