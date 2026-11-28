"use client";

import type { ReactNode } from "react";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { AppShell } from "@/widgets/app-shell";
import { TabBar } from "@/widgets/tab-bar";

import { useActiveReminder } from "@/features/date-reminder";

import {
  planNeedsMe,
  readPlanSeen,
  usePlanSeenVersion,
  usePlans,
} from "@/entities/plan";
import { santaTabDot, useSantaGames } from "@/entities/santa-game";

import { REMOTE_COPY, rendersBeforeReady } from "@/shared/config";
import { useAppMode, useAppReady, useAppStatus } from "@/shared/lib/app-status";
import { useRemoteSessionStore, useSessionStore } from "@/shared/store";
import { Button, EmptyState } from "@/shared/ui";

import { RouteSkeleton } from "./route-skeleton";
import { SessionGate } from "./session-gate";

// Демо-панель (шторка на motion) нужна только после готовности окружения —
// не тянем её в стартовый бандл.
const DemoPanel = dynamic(
  () => import("@/widgets/demo-panel").then((module) => module.DemoPanel),
  { ssr: false },
);

// Конверт Санты ждёт вскрытия (reference.html) или организатору пора тянуть
// пары (X10) — точка на табе «Санта».
// Напоминание о своей дате — точка на табе «Вишлист» (DESIGN.md §8.3).
// AppTabBar рисуется только у запущенной вкладки, а напоминание спрашивается
// ещё и только при сессии (useActiveReminder).
const AppTabBar = () => {
  const games = useSantaGames();
  const santa = santaTabDot(games.data ?? []);
  const reminder = useActiveReminder();
  // Ждут меня в плане (Q09) — по отметке «видел» этого устройства.
  const plans = usePlans();
  const meId = useSessionStore((state) => state.activeUserId);
  usePlanSeenVersion();
  const plansNeedMe = (plans.data ?? []).some(
    ({ plan }) => planNeedsMe(plan, meId, readPlanSeen(plan.id)) !== null,
  );
  return (
    <TabBar
      santaReady={santa.envelopeReady}
      santaDrawDue={santa.drawDue}
      plansNeedMe={plansNeedMe}
      wishlistReminder={reminder !== null}
    />
  );
};

// Пока вкладка не запустилась (app/environment.ts), большинство экранов
// показывают свой скелетон (route-skeleton.tsx): им нужны сессия и данные. Экраны из
// rendersBeforeReady рисуются сразу — их первый кадр есть уже в статическом
// HTML, а к API они сами не обращаются до useAppReady().
const EnvironmentGate = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const { status } = useAppStatus();
  // Сервер не принимает эту сборку (minClientBuild, B17): дальше экраны
  // работали бы с устаревшим контрактом — просим обновить страницу.
  const outdated = useRemoteSessionStore((state) => state.outdated);
  if (outdated) {
    return (
      <EmptyState
        className="h-full"
        title={REMOTE_COPY.updateTitle}
        description={REMOTE_COPY.updateText}
        action={
          <Button onClick={() => window.location.reload()}>
            {REMOTE_COPY.updateAction}
          </Button>
        }
      />
    );
  }
  // Запуск упал. В remote это не «сервер не ответил» — до сервера запуск не
  // ходит (shared/api/mode), а без ответа экран «Не получается связаться»
  // покажет SessionGate. Здесь — ошибка сборки (опечатка в
  // NEXT_PUBLIC_API_URL), поэтому текст прежний (S07).
  if (status === "failed") {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось запустить SwipeIt. Проверь связь и обнови страницу."
        action={
          <Button variant="secondary" onClick={() => window.location.reload()}>
            Обновить
          </Button>
        }
      />
    );
  }
  if (status === "ready" || rendersBeforeReady(pathname)) return children;
  return <RouteSkeleton />;
};

// Каркас всего приложения: оболочка + таб-бар. Собирается здесь, в слое app:
// виджеты одного слоя не импортируют друг друга (FSD), а корневой app/ steiger
// не сканирует — так он видит, что оба виджета используются.
//
// Оболочка (бархат, рамка) рисуется сразу. Таб-бар до запуска вкладки —
// без точек и бейджей (данных ещё нет), но на месте: скелетон экрана стоит
// уже в «настоящем» каркасе (DESIGN.md §6 «Прелоадер»). Точки и демо-панель
// читают данные и шину — их подключаем только после запуска. В remote
// демо-панели нет (BACKEND.md §3.4): перемотка, боты и «Смотреть как» — только
// в демо.
export const AppFrame = ({ children }: { children: ReactNode }) => {
  const ready = useAppReady();
  const demo = useAppMode() !== "remote";
  return (
    <AppShell
      tabBar={ready ? <AppTabBar /> : <TabBar />}
      overlay={ready && demo ? <DemoPanel /> : null}
    >
      <EnvironmentGate>
        <SessionGate>{children}</SessionGate>
      </EnvironmentGate>
    </AppShell>
  );
};
