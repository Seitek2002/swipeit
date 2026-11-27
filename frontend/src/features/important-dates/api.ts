"use client";

import {
  type QueryClient,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

import {
  type CreateDateInput,
  type ImportantDateView,
  type UpdateDateInput,
  createMyDate,
  deleteMyDate,
  friendKeys,
  getMyDates,
  updateMe,
  updateMyDate,
  userKeys,
  wishlistKeys,
} from "@/shared/api";
import { useMounted } from "@/shared/lib/dom";
import { useSessionStore } from "@/shared/store";

import { removeDate, replaceDate } from "./model";

// После любой правки дат перечитываем напоминание (баннер и точка на табе)
// и свой вишлист: повод в шапке может ссылаться на эту дату, а удаление
// сбрасывает его на «Просто так».
const refreshAround = (queryClient: QueryClient) => {
  void queryClient.invalidateQueries({ queryKey: userKeys.dates() });
  void queryClient.invalidateQueries({ queryKey: userKeys.reminders() });
  void queryClient.invalidateQueries({ queryKey: wishlistKeys.mine() });
};

// Свои значимые даты (личное: только владельцу). Сортировка — серверная, по
// ближайшему наступлению.
export const useMyDates = () => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: userKeys.dates(),
    queryFn: getMyDates,
    enabled: mounted && Boolean(userId),
  });
};

export const useCreateDate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateDateInput) => createMyDate(input),
    onSuccess: () => refreshAround(queryClient),
  });
};

export const useUpdateDate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: UpdateDateInput }) =>
      updateMyDate(id, patch),
    onSuccess: (next) => {
      // Новое название видно сразу, не после перечитывания списка.
      queryClient.setQueryData<ImportantDateView[]>(userKeys.dates(), (list) =>
        replaceDate(list, next),
      );
      refreshAround(queryClient);
    },
  });
};

export const useDeleteDate = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteMyDate(id),
    onSuccess: (_, id) => {
      queryClient.setQueryData<ImportantDateView[]>(userKeys.dates(), (list) =>
        removeDate(list, id),
      );
      refreshAround(queryClient);
    },
  });
};

// День рождения — поле профиля (PATCH /me { birthday }), а не значимая дата.
// Ответ — профиль целиком: кладём в кэш, как useUpdateMe, и перечитываем
// напоминание и друзей (у них «ближайшие дни рождения»).
export const useSetBirthday = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (birthday: string) => updateMe({ birthday }),
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.me(), user);
      void queryClient.invalidateQueries({ queryKey: userKeys.reminders() });
      void queryClient.invalidateQueries({ queryKey: friendKeys.all });
    },
  });
};
