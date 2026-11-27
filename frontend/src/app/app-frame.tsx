"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/widgets/app-shell";
import { DemoPanel } from "@/widgets/demo-panel";
import { TabBar } from "@/widgets/tab-bar";

import { useSantaGames } from "@/entities/santa-game";

import { SessionGate } from "./session-gate";

// Конверт Санты ждёт вскрытия — точка на табе «Санта» (reference.html).
const AppTabBar = () => {
  const games = useSantaGames();
  const ready = (games.data ?? []).some(
    (summary) => summary.me?.envelope === "ready",
  );
  return <TabBar santaReady={ready} />;
};

// Каркас всего приложения: оболочка + таб-бар. Собирается здесь, в слое app:
// виджеты одного слоя не импортируют друг друга (FSD), а корневой app/ steiger
// не сканирует — так он видит, что оба виджета используются.
export const AppFrame = ({ children }: { children: ReactNode }) => (
  <AppShell tabBar={<AppTabBar />} overlay={<DemoPanel />}>
    <SessionGate>{children}</SessionGate>
  </AppShell>
);
