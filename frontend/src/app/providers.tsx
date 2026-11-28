"use client";

import { type ReactNode, useEffect, useState } from "react";

import dynamic from "next/dynamic";

import {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";

import {
  SCOPE_KEYS,
  detectMode,
  expirePlans,
  isApiError,
  startBrowserBots,
  tickSanta,
} from "@/shared/api";
import { setAppStatus, useAppMode, useAppReady } from "@/shared/lib/app-status";
import { withBasePath } from "@/shared/lib/base-path";
import { useTapHaptics } from "@/shared/lib/dom";
import {
  holdPreloader,
  isPreloaderHidden,
  releasePreloader,
  settlePreloaderApp,
  startPreloader,
} from "@/shared/lib/preloader";
import {
  getConnectionStatus,
  getRealtime,
  subscribeConnection,
  useConnectionStatus,
} from "@/shared/lib/realtime";
import { useSessionStore } from "@/shared/store";
import { toast, useCurrentToast } from "@/shared/ui";

import { startEnvironment } from "./environment";

// Тосты появляются только по событию — их UI с motion (≈50 КБ) грузим после
// первого кадра, а не в стартовом бандле (Lighthouse, T20). Очередь тостов
// живёт в сторе: показанный до загрузки тост не потеряется.
const Toaster = dynamic(
  () => import("@/shared/ui/toast").then((module) => module.Toaster),
  { ssr: false },
);

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
// события могли пройти мимо (TECH_SPEC §7). В remote ноутбука нет — текст
// без него (BACKEND.md §9.3, черновик: финальный — PM).
const OFFLINE_TEXT = "Нет связи с ноутбуком. Переподключаемся…";
const REMOTE_OFFLINE_TEXT = "Нет связи с сервером. Переподключаемся…";
const showOffline = (remote: boolean) =>
  toast(remote ? REMOTE_OFFLINE_TEXT : OFFLINE_TEXT, {
    tone: "loading",
    duration: null,
  });

const ConnectionNotices = ({ remote }: { remote: boolean }) => {
  const queryClient = useQueryClient();
  const status = useConnectionStatus();
  const current = useCurrentToast();

  useEffect(
    () =>
      subscribeConnection(() => {
        if (getConnectionStatus() === "offline") {
          showOffline(remote);
        } else {
          toast("Снова в сети");
          void queryClient.invalidateQueries();
        }
      }),
    [queryClient, remote],
  );

  // Тост один на экране: другой («Не получилось…») мог сменить уведомление
  // и закрыться. Пока связи нет — возвращаем его.
  useEffect(() => {
    if (status === "offline" && current === null) showOffline(remote);
  }, [status, current, remote]);

  return null;
};

// Дедлайны планов «До даты» и жеребьёвка Санты по дате (TECH_SPEC §7 «Часы»): раз в 15 секунд, при
// возвращении во вкладку и после перемотки часов — наступил дедлайн, план
// переходит к итогам. Считает сервер (мок или ноутбук) по своим часам.
const PlanDeadlines = () => {
  const userId = useSessionStore((state) => state.activeUserId);
  useEffect(() => {
    if (!userId) return;
    const tick = () => {
      void expirePlans().catch(() => undefined);
      // Тайный Санта: жеребьёвка по дате (drawAt) — тем же проходом.
      void tickSanta().catch(() => undefined);
    };
    const timer = setInterval(tick, 15_000);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    const unsubscribe = getRealtime().subscribe((event) => {
      if (event.type === "db:changed" && event.scope.includes("settings")) {
        tick();
      }
    });
    tick();
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      unsubscribe();
    };
  }, [userId]);
  return null;
};

// Service worker (TECH_SPEC §11): только в режиме local, только в собранной
// версии и только в безопасном контексте (HTTPS или localhost). В «Локальной
// сети» по http он не нужен и недоступен.
const ServiceWorker = () => {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator) || !window.isSecureContext) return;
    void detectMode().then((mode) => {
      if (mode !== "local") return;
      navigator.serviceWorker
        .register(withBasePath("/sw.js"), { scope: withBasePath("/") })
        .catch(() => undefined);
    });
  }, []);
  return null;
};

// Боты (TECH_SPEC §7): в local их исполняет одна вкладка-лидер, в lan —
// сервер, и вкладки их не запускают. В remote ботов нет вовсе (BACKEND.md §7).
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

// Запуск вкладки (TECH_SPEC §6): режим, транспорт, шина, сессия. Итог —
// во флаг готовности (shared/lib/app-status): по нему экран решает, что
// рисовать, а подписчики шины ниже — когда подписываться.
const EnvironmentStarter = () => {
  useEffect(() => {
    startPreloader();
    startEnvironment().then(
      (mode) => {
        setAppStatus({ status: "ready", mode });
        settlePreloaderApp();
      },
      (error: unknown) => {
        console.error("SwipeIt не запустился:", error);
        setAppStatus({ status: "failed" });
        // Экран ошибки с «Обновить» — прелоадер уходит, чтобы его показать.
        settlePreloaderApp();
      },
    );
  }, []);
  return null;
};

// Первые запросы экрана держат прелоадер (DESIGN.md §6: «на остальных
// экранах — их первый запрос»): пока идёт загрузка, человек видит бант, а не
// скелетоны на долю секунды. После скрытия прелоадера не слушаем.
const InitialQueriesHold = () => {
  const queryClient = useQueryClient();
  useEffect(() => {
    const sync = () => {
      if (isPreloaderHidden()) return;
      if (queryClient.isFetching() > 0) holdPreloader("queries");
      else releasePreloader("queries");
    };
    sync();
    const unsubscribe = queryClient.getQueryCache().subscribe(sync);
    return () => {
      unsubscribe();
      releasePreloader("queries");
    };
  }, [queryClient]);
  return null;
};

// Всё, что ходит в API или слушает шину, — только после запуска: в lan
// шина — WebSocket ноутбука, и подписка до запуска осталась бы на
// заглушке, а запросы ушли бы в мок. Экран (children) рисуется сразу —
// что показывать до готовности, решает app-frame.
//
// В remote нет клиентского планировщика: /plans/expire и /santa/tick там не
// существуют, дедлайны и жеребьёвку по дате считает сам сервер (B13).
const ReadyBridges = () => {
  const ready = useAppReady();
  const remote = useAppMode() === "remote";
  if (!ready) return null;
  return (
    <>
      <RealtimeBridge />
      <SessionCacheReset />
      <ConnectionNotices remote={remote} />
      <BotsLeader />
      <ServiceWorker />
      {!remote && <PlanDeadlines />}
      <InitialQueriesHold />
    </>
  );
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
      <EnvironmentStarter />
      <ReadyBridges />
      {children}
      <Toaster />
      {/* Кнопка devtools висит поверх экрана телефона и мешает проверять
          вёрстку — включается только по NEXT_PUBLIC_RQ_DEVTOOLS=1. */}
      {process.env.NEXT_PUBLIC_RQ_DEVTOOLS === "1" && (
        <ReactQueryDevtools initialIsOpen={false} />
      )}
    </QueryClientProvider>
  );
};
