"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type UpdateMeInput,
  friendKeys,
  getFriends,
  getMe,
  loginDemoFn,
  updateMe,
  userKeys,
} from "@/shared/api";
import { useMounted } from "@/shared/lib/dom";
import { useSessionStore } from "@/shared/store";

// Текущий пользователь вкладки. Ждём монтирования: сессия живёт в
// sessionStorage, на сервере её нет (TECH_SPEC §3).
export const useMe = () => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: userKeys.me(),
    queryFn: getMe,
    enabled: mounted && Boolean(userId),
  });
};

export const useFriends = () => {
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  return useQuery({
    queryKey: friendKeys.list(),
    queryFn: getFriends,
    enabled: mounted && Boolean(userId),
  });
};

// Вход демо-пользователем «Айгерим»: сессия вкладки → её id, кэш — заново.
export const useLoginDemo = () => {
  const queryClient = useQueryClient();
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  return useMutation({
    mutationFn: loginDemoFn,
    onSuccess: (user) => {
      setActiveUser(user.id);
      queryClient.clear();
    },
  });
};

// Правка своего профиля: ответ сразу кладём в кэш, остальные вкладки узнают
// из события db:changed.
export const useUpdateMe = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (patch: UpdateMeInput) => updateMe(patch),
    onSuccess: (user) => {
      queryClient.setQueryData(userKeys.me(), user);
      void queryClient.invalidateQueries({ queryKey: friendKeys.all });
    },
  });
};
