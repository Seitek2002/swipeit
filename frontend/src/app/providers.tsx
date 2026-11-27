"use client";

import { type ReactNode, useEffect, useState } from "react";

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import {
  SCOPE_KEYS,
  detectMode,
  isApiError,
  startBrowserBots,
} from "@/shared/api";
import { useTapHaptics } from "@/shared/lib/dom";
import {
  getConnectionStatus,
  getRealtime,
  subscribeConnection,
} from "@/shared/lib/realtime";
import { useSessionStore } from "@/shared/store";
import { Splash, Toaster, toast } from "@/shared/ui";

import { startEnvironment } from "./environment";

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

// Потеря связи с ноутбуком (DESIGN.md §8.11): тост без автозакрытия со
// спиннером; вернулась — «Снова в сети» и перечитать всё: пока связи не было,
// события могли пройти мимо (TECH_SPEC §7).
const ConnectionNotices = () => {
  const queryClient = useQueryClient();
  useEffect(
    () =>
      subscribeConnection(() => {
        if (getConnectionStatus() === "offline") {
          toast("Нет связи с ноутбуком. Переподключаемся…", {
            tone: "loading",
            duration: null,
          });
        } else {
          toast("Снова в сети");
          void queryClient.invalidateQueries();
        }
      }),
    [queryClient],
  );
  return null;
};

// Боты (TECH_SPEC §7): в local их исполняет одна вкладка-лидер, в lan —
// сервер, и вкладки их не запускают.
const BotsLeader = () => {
  useEffect(() => {
    let cancelled = false;
    void detectMode().then((mode) => {
      if (!cancelled && mode === "local") startBrowserBots();
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return null;
};

// Пока режим не определён, шина, транспорт и сессия ещё не настроены —
// ничего, что ходит в API или слушает шину, не рендерим (TECH_SPEC §6).
const EnvironmentGate = ({ children }: { children: ReactNode }) => {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void startEnvironment().then(() => {
      if (!cancelled) setReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return ready ? children : <Splash />;
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
      <EnvironmentGate>
        <RealtimeBridge />
        <SessionCacheReset />
        <ConnectionNotices />
        <BotsLeader />
        {children}
      </EnvironmentGate>
      <Toaster />
      {/* Кнопка devtools висит поверх экрана телефона и мешает проверять
          вёрстку — включается только по NEXT_PUBLIC_RQ_DEVTOOLS=1. */}
      {process.env.NEXT_PUBLIC_RQ_DEVTOOLS === "1" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
};
