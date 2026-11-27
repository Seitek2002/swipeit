"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type Reminder,
  dismissReminder,
  getMyReminders,
  userKeys,
} from "@/shared/api";
import { useAppReady } from "@/shared/lib/app-status";
import { useMounted } from "@/shared/lib/dom";
import { useSessionStore } from "@/shared/store";

// Активное напоминание о своей дате (TECH_SPEC §6 «Даты и напоминания»):
// сервер отдаёт 0 или 1 — берём первое. null — показывать нечего. Спрашиваем
// только у запущенной вкладки с сессией: даты личные, а без сессии маршрут
// ответит ошибкой. Ключ под "users" — его перечитывает область "users", в
// том числе после «Перемотать к напоминанию».
export const useActiveReminder = (): null | Reminder => {
  const mounted = useMounted();
  const ready = useAppReady();
  const userId = useSessionStore((state) => state.activeUserId);
  const query = useQuery({
    queryKey: userKeys.reminders(),
    queryFn: getMyReminders,
    enabled: mounted && ready && Boolean(userId),
    select: (list) => list[0] ?? null,
  });
  return query.data ?? null;
};

// «Скрыть» — до следующего года. Ответ — напоминания уже без скрытого:
// кладём их в кэш сразу, баннер и точка на табе гаснут вместе.
export const useDismissReminder = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => dismissReminder(id),
    onSuccess: (reminders) => {
      queryClient.setQueryData(userKeys.reminders(), reminders);
    },
  });
};
