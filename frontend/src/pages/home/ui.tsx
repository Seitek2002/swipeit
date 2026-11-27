"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { useMe } from "@/entities/user";

import { isApiError } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { useMounted } from "@/shared/lib/dom";
import { usePreloaderHold } from "@/shared/lib/preloader";
import { useSessionStore } from "@/shared/store";
import { Button, EmptyState, Splash } from "@/shared/ui";

// Вход «/» (TECH_SPEC §10): профиля нет — онбординг, есть — лента подарков.
// Пока решаем — под прелоадером (заставка — на случай, если он уже ушёл).
export const HomePage = () => {
  const router = useRouter();
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  const me = useMe();
  const failed =
    me.isError && !(isApiError(me.error) && me.error.code === "NOT_FOUND");
  // Пока решаем, куда вести, — под прелоадером; уходим вместе с ним в ленту
  // (её удержание ставится в том же коммите). Ошибку показываем сразу.
  usePreloaderHold("home", !failed);

  useEffect(() => {
    if (!mounted) return;
    if (!userId) router.replace(ROUTES.ONBOARDING);
    else if (me.data) router.replace(ROUTES.GIFTS);
  }, [mounted, userId, me.data, router]);

  // NOT_FOUND разбирают «ворота» сессии (уводят в онбординг). Другая ошибка —
  // нет связи или сбой: не держим человека на заставке вечно.
  if (failed) {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось открыть приложение. Проверь связь и попробуй ещё раз."
        action={
          <Button variant="secondary" onClick={() => void me.refetch()}>
            Попробовать ещё раз
          </Button>
        }
      />
    );
  }

  return <Splash />;
};
