"use client";

import { type ReactNode, useEffect, useState } from "react";

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import { SCOPE_KEYS, isApiError } from "@/shared/api";
import { useTapHaptics } from "@/shared/lib/dom";
import { getRealtime } from "@/shared/lib/realtime";
import { useSessionStore } from "@/shared/store";
import { Toaster, toast } from "@/shared/ui";

// Подписчик шины реального времени (TECH_SPEC §7): по db:changed перечитывает
// нужные запросы, по toast показывает тост. Компоненты сами на шину не
// подписываются — кроме оверлея «Совпадение» и прогресса участников (T14).
const RealtimeBridge = () => {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      getRealtime().subscribe((event) => {
        if (event.type === "db:changed") {
          for (const scope of event.scope) {
            for (const queryKey of SCOPE_KEYS[scope]) {
              void queryClient.invalidateQueries({ queryKey });
            }
          }
        } else if (event.type === "toast") {
          const me = useSessionStore.getState().activeUserId;
          if (!event.forUserId || event.forUserId === me) {
            toast(event.text, { tone: "info" });
          }
        }
      }),
    [queryClient],
  );

  return null;
};

// Сменился пользователь вкладки (онбординг, демо-вход, «Смотреть как») —
// кэш React Query целиком заново: ключи не содержат id пользователя, и без
// сброса до 30 секунд показывались бы данные прошлого.
const SessionCacheReset = () => {
  const queryClient = useQueryClient();

  useEffect(
    () =>
      useSessionStore.subscribe((state, previous) => {
        if (state.activeUserId !== previous.activeUserId) queryClient.clear();
      }),
    [queryClient],
  );

  return null;
};

export const Providers = ({ children }: { children: ReactNode }) => {
  useTapHaptics();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // TECH_SPEC §9: данные «с сервера» свежие 30 секунд; изменения
            // от других вкладок и ботов приходят событием, а не опросом.
            staleTime: 30_000,
            refetchOnWindowFocus: false,
            // Повторяем только сбой связи (OFFLINE) и неожиданные ошибки.
            // Ответы API (не найдено, нет доступа, память заполнена) повтор
            // не исправит.
            retry: (failureCount, error) => {
              if (isApiError(error) && error.code !== "OFFLINE") return false;
              return failureCount < 2;
            },
          },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <RealtimeBridge />
      <SessionCacheReset />
      {children}
      <Toaster />
      <ReactQueryDevtools initialIsOpen={false} buttonPosition="top-right" />
    </QueryClientProvider>
  );
};
