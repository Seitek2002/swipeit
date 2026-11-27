"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname } from "next/navigation";

import { useCreateUser, useMe } from "@/entities/user";

import { isApiError } from "@/shared/api";
import { requiresProfile } from "@/shared/config";
import { useAppReady } from "@/shared/lib/app-status";
import { useMounted } from "@/shared/lib/dom";
import { usePreloaderHold } from "@/shared/lib/preloader";
import { useSessionStore } from "@/shared/store";
import { Button, EmptyState, Splash } from "@/shared/ui";

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
  const profileMissing = isApiError(me.error) && me.error.code === "NOT_FOUND";
  const shouldCreate = ready && mounted && needsProfile && !userId;

  useEffect(() => {
    if (profileMissing) setActiveUser(null);
  }, [profileMissing, setActiveUser]);

  const { isIdle, mutate } = createUser;
  useEffect(() => {
    if (shouldCreate && isIdle) mutate(undefined);
  }, [shouldCreate, isIdle, mutate]);

  const waiting = needsProfile && (!ready || !mounted || !userId);
  usePreloaderHold("profile", waiting && !createUser.isError);

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
  if (waiting) return <Splash />;
  return children;
};
