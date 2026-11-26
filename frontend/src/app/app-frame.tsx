"use client";

import type { ReactNode } from "react";

import { AppShell } from "@/widgets/app-shell";
import { TabBar } from "@/widgets/tab-bar";

import { SessionGate } from "./session-gate";

// Каркас всего приложения: оболочка + таб-бар. Собирается здесь, в слое app:
// виджеты одного слоя не импортируют друг друга (FSD), а корневой app/ steiger
// не сканирует — так он видит, что оба виджета используются.
export const AppFrame = ({ children }: { children: ReactNode }) => (
  <AppShell tabBar={<TabBar />}>
    <SessionGate>{children}</SessionGate>
  </AppShell>
);
