"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname } from "next/navigation";

import { startAnonymousAgain, useCreateUser, useMe } from "@/entities/user";

import { isApiError } from "@/shared/api";
import { requiresProfile } from "@/shared/config";
import { useAppReady } from "@/shared/lib/app-status";
import { useMounted } from "@/shared/lib/dom";
import { usePreloaderHold } from "@/shared/lib/preloader";
import { useRemoteSessionStore, useSessionStore } from "@/shared/store";
import { Button, EmptyState } from "@/shared/ui";

import { RouteSkeleton } from "./route-skeleton";

// Режим remote: сервер ответил 401 — токен неверный или сессия закрыта
// (BACKEND.md §3.2). Новый профиль поверх старого молча не создаём, а
// спрашиваем. «Войти через Telegram» появится в B19. Тексты — черновые по §3,
// финальные — PM в DESIGN.
const SessionExpired = () => (
  <EmptyState
    className="h-full"
    title="Сессия закончилась. Профиль на этом телефоне больше не открыт — можно начать заново с пустого профиля."
    action={
      <Button variant="secondary" onClick={startAnonymousAgain}>
        Начать заново
      </Button>
    }
  />
);

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
  const profileMissing = isApiError(me.error) && me.error.code === "NOT_FOUND";
  const shouldCreate = ready && mounted && needsProfile && !userId && !expired;

  useEffect(() => {
    if (profileMissing) setActiveUser(null);
  }, [profileMissing, setActiveUser]);

  // Не isIdle: после успешного создания мутация уже не «idle», а сессию
  // может очистить сброс демо в другой вкладке — тогда создаём заново.
  const { isPending, isError, mutate } = createUser;
  useEffect(() => {
    if (shouldCreate && !isPending && !isError) mutate(undefined);
  }, [shouldCreate, isPending, isError, mutate]);

  const waiting = needsProfile && (!ready || !mounted || !userId);
  usePreloaderHold("profile", waiting && !createUser.isError && !expired);

  if (needsProfile && expired) return <SessionExpired />;
  if (needsProfile && createUser.isError) {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось открыть приложение. Проверь связь и попробуй ещё раз."
        action={
          <Button
            variant="secondary"
            loading={createUser.isPending}
            onClick={() => {
              createUser.reset();
              mutate(undefined);
            }}
          >
            Попробовать ещё раз
          </Button>
        }
      />
    );
  }
  // Не логотип, а скелетон экрана (DESIGN.md §6 «Прелоадер»).
  if (waiting) return <RouteSkeleton />;
  return children;
};
