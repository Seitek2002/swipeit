"use client";

import type { ReactNode } from "react";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

import { AppShell } from "@/widgets/app-shell";
import { TabBar } from "@/widgets/tab-bar";

import { useActiveReminder } from "@/features/date-reminder";

import { useSantaGames } from "@/entities/santa-game";

import { rendersBeforeReady } from "@/shared/config";
import { useAppReady, useAppStatus } from "@/shared/lib/app-status";
import { Button, EmptyState, Splash } from "@/shared/ui";

import { SessionGate } from "./session-gate";

// Демо-панель (шторка на motion) нужна только после готовности окружения —
// не тянем её в стартовый бандл.
const DemoPanel = dynamic(
  () => import("@/widgets/demo-panel").then((module) => module.DemoPanel),
  { ssr: false },
);

// Конверт Санты ждёт вскрытия — точка на табе «Санта» (reference.html).
// Напоминание о своей дате — точка на табе «Вишлист» (DESIGN.md §8.3).
// AppTabBar рисуется только у запущенной вкладки, а напоминание спрашивается
// ещё и только при сессии (useActiveReminder).
const AppTabBar = () => {
  const games = useSantaGames();
  const ready = (games.data ?? []).some(
    (summary) => summary.me?.envelope === "ready",
  );
  const reminder = useActiveReminder();
  return <TabBar santaReady={ready} wishlistReminder={reminder !== null} />;
};

// Пока вкладка не запустилась (app/environment.ts), большинство экранов
// показывают заставку: им нужны сессия и данные. Экраны из
// rendersBeforeReady рисуются сразу — их первый кадр есть уже в статическом
// HTML, а к API они сами не обращаются до useAppReady().
const EnvironmentGate = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const { status } = useAppStatus();
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
  return <Splash />;
};

// Каркас всего приложения: оболочка + таб-бар. Собирается здесь, в слое app:
// виджеты одного слоя не импортируют друг друга (FSD), а корневой app/ steiger
// не сканирует — так он видит, что оба виджета используются.
//
// Оболочка (бархат, рамка) рисуется сразу. Таб-бар и демо-панель читают
// данные и шину — их подключаем только после запуска вкладки.
export const AppFrame = ({ children }: { children: ReactNode }) => {
  const ready = useAppReady();
  return (
    <AppShell
      tabBar={ready ? <AppTabBar /> : null}
      overlay={ready ? <DemoPanel /> : null}
    >
      <EnvironmentGate>
        <SessionGate>{children}</SessionGate>
      </EnvironmentGate>
    </AppShell>
  );
};
