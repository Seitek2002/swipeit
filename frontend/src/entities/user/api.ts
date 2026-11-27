"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type NewUserInput,
  type UpdateMeInput,
  createUser,
  friendKeys,
  getFriends,
  getMe,
  getMode,
  getPresence,
  getUser,
  loginDemoFn,
  reservationKeys,
  updateMe,
  userKeys,
} from "@/shared/api";
import { useMounted } from "@/shared/lib/dom";
import { useGuestStore, useSessionStore } from "@/shared/store";

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

// Профиль другого человека (друг, бот) — для «Профиль друга».
export const useUser = (id: string | undefined) => {
  const mounted = useMounted();
  return useQuery({
    queryKey: userKeys.detail(id ?? ""),
    queryFn: () => getUser(id ?? ""),
    enabled: mounted && Boolean(id),
  });
};

// Кто онлайн в «Локальной сети» — мятная точка у друга (DESIGN.md §8.11).
// В local не спрашиваем: там все «друзья» живут в этом браузере.
export const usePresence = () => {
  const mounted = useMounted();
  return useQuery({
    queryKey: friendKeys.presence(),
    queryFn: getPresence,
    enabled: mounted && getMode() === "lan",
    select: (data) => ({
      devices: data.devices,
      online: new Set(data.online),
    }),
  });
};

// Свой профиль до «Войти как демо-пользователь» — чтобы вернуться в него
// (auto-tasks V03): раньше путь назад был только через «Смотреть как».
const OWN_USER_KEY = "swipeit:ownUserId";

export const readOwnUserId = (): null | string => {
  try {
    return localStorage.getItem(OWN_USER_KEY);
  } catch {
    return null;
  }
};

const rememberOwnUser = (userId: null | string) => {
  try {
    if (userId) localStorage.setItem(OWN_USER_KEY, userId);
    else localStorage.removeItem(OWN_USER_KEY);
  } catch {
    // Хранилище запрещено — вернуться можно через «Смотреть как».
  }
};

// Вход демо-пользователем «Айгерим»: сессия вкладки → её id, кэш — заново.
// Свой профиль запоминаем: в профиле Айгерим будет «Вернуться в свой».
export const useLoginDemo = () => {
  const queryClient = useQueryClient();
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  return useMutation({
    mutationFn: loginDemoFn,
    onSuccess: (user) => {
      const previous = useSessionStore.getState().activeUserId;
      if (previous && previous !== user.id) rememberOwnUser(previous);
      setActiveUser(user.id);
      queryClient.clear();
    },
  });
};

// «Вернуться в свой профиль» из демо-Айгерим.
export const useReturnToOwnUser = () => {
  const queryClient = useQueryClient();
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  return (ownUserId: string) => {
    setActiveUser(ownUserId);
    rememberOwnUser(null);
    queryClient.clear();
  };
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

// Профиль из онбординга: новый пользователь сразу становится пользователем
// вкладки (и «последним» на устройстве — после перезагрузки остаётся в системе).
export const useCreateUser = () => {
  const queryClient = useQueryClient();
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  return useMutation({
    // Гость по ссылке, который уже бронировал и назвался, — брони и имя
    // переходят в профиль (auto-tasks U02).
    mutationFn: (input?: NewUserInput) => {
      const guest = useGuestStore.getState();
      return createUser({
        ...input,
        guestId: guest.guestId,
        ...(input?.name || !guest.name ? {} : { name: guest.name }),
      });
    },
    onSuccess: (user) => {
      setActiveUser(user.id);
      queryClient.setQueryData(userKeys.me(), user);
      void queryClient.invalidateQueries({ queryKey: reservationKeys.all });
    },
  });
};
