"use client";

import { type ReactNode, useEffect } from "react";

import { useRouter } from "next/navigation";

import { ROUTES } from "@/shared/config";
import { useAppReady } from "@/shared/lib/app-status";
import { usePreloaderHold } from "@/shared/lib/preloader";

// Вход «/» (TECH_SPEC §10): всегда лента подарков. Нет профиля — его сам
// создаст SessionGate ленты, под тем же прелоадером (DESIGN.md §8.1).
// До перехода — скелетон ленты (передаёт app/page.tsx: страницы одного слоя
// друг друга не импортируют), а не логотип (DESIGN.md §6 «Прелоадер»).
export const HomePage = ({ skeleton }: { skeleton: ReactNode }) => {
  const router = useRouter();
  const ready = useAppReady();
  // Под прелоадером до перехода: удержание ленты ставится в том же коммите.
  usePreloaderHold("home", true);

  useEffect(() => {
    if (ready) router.replace(ROUTES.GIFTS);
  }, [ready, router]);

  return skeleton;
};
