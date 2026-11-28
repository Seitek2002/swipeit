"use client";

import { type ReactNode, useEffect, useRef } from "react";

import { usePathname } from "next/navigation";

import {
  TelegramLoginButton,
  startAnonymousAgain,
  useCreateUser,
  useMe,
} from "@/entities/user";

import {
  errorCodeOf,
  isApiError,
  isTelegramLoginEnabled,
  trackStep,
} from "@/shared/api";
import { REMOTE_COPY, requiresProfile } from "@/shared/config";
import { useAppMode, useAppReady } from "@/shared/lib/app-status";
import { useMounted } from "@/shared/lib/dom";
import { usePreloaderHold } from "@/shared/lib/preloader";
import {
  takeRemoteNotice,
  useRemoteSessionStore,
  useSessionStore,
} from "@/shared/store";
import { Button, EmptyState, ErrorCode, toast } from "@/shared/ui";

import { RouteSkeleton } from "./route-skeleton";

// Режим remote: сервер ответил 401 — токен неверный или сессия закрыта
// (BACKEND.md §3.2). Новый профиль поверх старого молча не создаём, а
// спрашиваем. Тексты — R07 (REMOTE_COPY). С входом через Telegram (S03,
// NEXT_PUBLIC_TELEGRAM_CLIENT_ID) — он первой кнопкой: профиль Telegram
// откроется и здесь; без него — только «Начать заново».
//
// Шаг воронки session_expired_seen (R09) со старым токеном не дойдёт (401) —
// он ждёт нового профиля после «Начать заново» (shared/api/funnel).
const SessionExpired = () => {
  const mounted = useMounted();
  const telegram = mounted && isTelegramLoginEnabled();
  useEffect(() => {
    trackStep("session_expired_seen");
  }, []);
  return (
    <EmptyState
      className="h-full"
      title={REMOTE_COPY.sessionExpiredTitle}
      description={
        telegram
          ? REMOTE_COPY.sessionExpiredTelegramText
          : REMOTE_COPY.sessionExpiredText
      }
      action={
        <div className="flex flex-col items-center gap-3">
          {telegram && <TelegramLoginButton variant="primary" />}
          <Button variant="secondary" onClick={() => startAnonymousAgain()}>
            {REMOTE_COPY.sessionExpiredAction}
          </Button>
        </div>
      }
    />
  );
};

// Анкеты нет (DESIGN.md §8.1, TECH_SPEC §10): экран с профилем без сессии сам
// создаёт безымянный профиль (POST /users) под прелоадером и остаётся тем же
// экраном. Профиль пропал из базы (сброс в другой вкладке, порча хранилища) —
// сессия вкладки очищается, и создаётся новый. Гостевые экраны (чужой
// вишлист по ссылке и т. п.) профиль сами не создают.
export const SessionGate = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const mounted = useMounted();
  // До запуска вкладки сессия ещё не прочитана (skipHydration): userId пуст
  // у любого, и без этой проверки вошедшему создали бы второй профиль.
  const ready = useAppReady();
  const userId = useSessionStore((state) => state.activeUserId);
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  const me = useMe();
  const createUser = useCreateUser();
  const needsProfile = requiresProfile(pathname);
  const expired = useRemoteSessionStore((state) => state.expired);
  const remote = useAppMode() === "remote";
  const profileMissing = isApiError(me.error) && me.error.code === "NOT_FOUND";
  const shouldCreate = ready && mounted && needsProfile && !userId && !expired;

  useEffect(() => {
    if (profileMissing) setActiveUser(null);
  }, [profileMissing, setActiveUser]);

  // Не isIdle: после успешного создания мутация уже не «idle», а сессию
  // может очистить сброс демо в другой вкладке — тогда создаём заново.
  const { isPending, isError, mutate } = createUser;
  // StrictMode в dev запускает эффект дважды в одном рендере: isPending ещё
  // false, и без этой отметки уходили два POST /users — два профиля.
  const creating = useRef(false);
  useEffect(() => {
    if (!shouldCreate || isPending || isError || creating.current) return;
    creating.current = true;
    mutate(undefined, {
      onSettled: () => {
        creating.current = false;
      },
    });
  }, [shouldCreate, isPending, isError, mutate]);

  // Тост после перезапуска вкладки («Профиль удалён», S07) — когда новый
  // профиль уже открыт, а не под прелоадером.
  useEffect(() => {
    if (!ready || !userId) return;
    const notice = takeRemoteNotice();
    if (notice) toast(notice);
  }, [ready, userId]);

  const waiting = needsProfile && (!ready || !mounted || !userId);
  usePreloaderHold("profile", waiting && !createUser.isError && !expired);

  if (needsProfile && expired) return <SessionExpired />;
  if (needsProfile && createUser.isError) {
    // Сервер ответил ошибкой — код для владельца (S08); нет связи — кода нет.
    // В remote это и есть «сервер не ответил при запуске» (BACKEND §9.1):
    // профиля нет, а создать его не вышло. Тексты R07 (S07).
    const errorCode = errorCodeOf(createUser.error);
    return (
      <EmptyState
        className="h-full"
        title={
          remote
            ? REMOTE_COPY.unreachable
            : "Не получилось открыть приложение. Проверь связь и попробуй ещё раз."
        }
        action={
          <Button
            variant="secondary"
            loading={createUser.isPending}
            onClick={() => {
              createUser.reset();
              mutate(undefined);
            }}
          >
            {REMOTE_COPY.retry}
          </Button>
        }
        footer={errorCode && <ErrorCode code={errorCode} />}
      />
    );
  }
  // Не логотип, а скелетон экрана (DESIGN.md §6 «Прелоадер»).
  if (waiting) return <RouteSkeleton />;
  return children;
};
