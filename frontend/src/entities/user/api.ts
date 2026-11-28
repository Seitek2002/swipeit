"use client";

import { useCallback, useEffect, useState } from "react";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  type NewUserInput,
  TelegramLoginCancelled,
  type TelegramLoginResult,
  type UpdateMeInput,
  askTelegramIdToken,
  createUser,
  deleteMe,
  friendKeys,
  getFriends,
  getMe,
  getMode,
  getPresence,
  getTelegramNonce,
  getUser,
  isApiError,
  isTelegramLoginEnabled,
  loadTelegramLogin,
  loadedTelegramLogin,
  loginDemoFn,
  loginTelegram,
  logout,
  reservationKeys,
  updateMe,
  userKeys,
} from "@/shared/api";
import { REMOTE_COPY, ROUTES, telegramClientId } from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";
import { useMounted } from "@/shared/lib/dom";
import {
  clearRemoteSession,
  rememberRemoteNotice,
  useGuestStore,
  useSessionStore,
} from "@/shared/store";
import { toast } from "@/shared/ui";

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

// Режим remote: начать с нового анонимного профиля (после «Выйти»,
// «Удалить профиль», «Сессия закончилась» → «Начать заново», BACKEND.md
// §3.4). Токена нет — вкладка заново: прелоадер, POST /users, обучающая
// карточка; другие вкладки перезапустятся по событию storage. notice — тост
// уже в новом профиле (app/session-gate).
export const startAnonymousAgain = (notice?: string) => {
  if (notice) rememberRemoteNotice(notice);
  clearRemoteSession();
  useSessionStore.getState().setActiveUser(null);
  window.location.assign(withBasePath(ROUTES.GIFTS));
};

// Сессию уже закрыли (401) — для «Выйти» это тоже успех.
const ignoreUnauthorized = (error: unknown) => {
  if (isApiError(error) && error.code === "UNAUTHORIZED") return;
  throw error;
};

// «Выйти» (POST /auth/logout): закрывает сессию этого устройства.
export const useLogout = () =>
  useMutation({
    mutationFn: () => logout().then(() => undefined, ignoreUnauthorized),
    onSuccess: () => startAnonymousAgain(),
  });

// «Удалить профиль» (DELETE /me): человек и его данные удаляются на сервере.
export const useDeleteMe = () =>
  useMutation({
    mutationFn: () => deleteMe().then(() => undefined),
    onSuccess: () => startAnonymousAgain(REMOTE_COPY.profileDeleted),
  });

// ── Вход через Telegram (BACKEND.md §3.3, auto-tasks-pm-4 S03) ──────────

// nonce живёт на сервере 10 минут; берём заранее, чтобы окно Telegram
// открылось прямо в нажатии (иначе браузер его заблокирует), и обновляем,
// если он старше 8 минут.
const NONCE_FRESH_MS = 8 * 60_000;
let preparedNonce: { at: number; nonce: string } | null = null;

const prepareNonce = async (): Promise<string> => {
  if (preparedNonce && Date.now() - preparedNonce.at < NONCE_FRESH_MS) {
    return preparedNonce.nonce;
  }
  const { nonce } = await getTelegramNonce();
  preparedNonce = { at: Date.now(), nonce };
  return nonce;
};

// Одноразовый: после окна Telegram им уже вошли.
const takeNonce = async (): Promise<string> => {
  const nonce = await prepareNonce();
  preparedNonce = null;
  return nonce;
};

const errorText = (error: unknown) =>
  isApiError(error) && error.code !== "INTERNAL"
    ? error.message
    : REMOTE_COPY.telegramFailed;

// Кнопка «Войти через Telegram»: в профиле и на «Сессия закончилась».
// switchWishes — не null, пока открыт вопрос «Войти в другой профиль?»
// (на этом телефоне есть желания, а у Telegram — свой профиль).
export const useTelegramLogin = () => {
  const queryClient = useQueryClient();
  const mounted = useMounted();
  const enabled = mounted && isTelegramLoginEnabled();
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState<{
    idToken: string;
    localWishes: number;
  } | null>(null);

  useEffect(() => {
    if (!enabled) return;
    loadTelegramLogin().catch(() => undefined);
    prepareNonce().catch(() => undefined);
  }, [enabled]);

  const apply = useCallback(
    (result: TelegramLoginResult, idToken: string) => {
      if (result.status === "confirm") {
        setPending({ idToken, localWishes: result.localWishes });
        return;
      }
      setPending(null);
      if (result.status === "linked") {
        queryClient.setQueryData(userKeys.me(), result.me);
        toast(REMOTE_COPY.telegramLinkedToast, { tone: "success" });
        return;
      }
      // Другой профиль на этом телефоне: токен уже сохранён (loginTelegram),
      // вкладка запускается заново — с новым WebSocket и кэшем. Остальные
      // вкладки перезапустятся по событию storage.
      useSessionStore.getState().setActiveUser(result.me.id);
      window.location.reload();
    },
    [queryClient],
  );

  const run = useCallback(async (step: () => Promise<void>) => {
    setBusy(true);
    try {
      await step();
    } catch (error) {
      if (!(error instanceof TelegramLoginCancelled)) {
        toast(errorText(error), { tone: "error" });
      }
    } finally {
      setBusy(false);
    }
  }, []);

  const start = useCallback(() => {
    const clientId = telegramClientId();
    if (!clientId) return;
    // Окно — синхронно в нажатии, если скрипт и nonce уже готовы.
    const sdk = loadedTelegramLogin();
    const ready =
      sdk && preparedNonce && Date.now() - preparedNonce.at < NONCE_FRESH_MS
        ? preparedNonce.nonce
        : null;
    void run(async () => {
      let idTokenPromise: Promise<string>;
      if (sdk && ready) {
        preparedNonce = null;
        idTokenPromise = askTelegramIdToken(sdk, clientId, ready);
      } else {
        const [loaded, nonce] = await Promise.all([
          loadTelegramLogin(),
          takeNonce(),
        ]);
        idTokenPromise = askTelegramIdToken(loaded, clientId, nonce);
      }
      const idToken = await idTokenPromise;
      apply(await loginTelegram({ idToken }), idToken);
    }).finally(() => {
      // Следующая попытка — с новым nonce, тоже заранее.
      prepareNonce().catch(() => undefined);
    });
  }, [apply, run]);

  const confirmSwitch = useCallback(() => {
    if (!pending) return;
    const { idToken } = pending;
    void run(async () => {
      apply(await loginTelegram({ idToken, confirmSwitch: true }), idToken);
    });
  }, [apply, pending, run]);

  return {
    busy,
    cancelSwitch: () => setPending(null),
    confirmSwitch,
    enabled,
    start,
    switchWishes: pending?.localWishes ?? null,
  };
};
