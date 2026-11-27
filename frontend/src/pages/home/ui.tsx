"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { ROUTES } from "@/shared/config";
import { useAppReady } from "@/shared/lib/app-status";
import { usePreloaderHold } from "@/shared/lib/preloader";
import { Splash } from "@/shared/ui";

// Вход «/» (TECH_SPEC §10): всегда лента подарков. Нет профиля — его сам
// создаст SessionGate ленты, под тем же прелоадером (DESIGN.md §8.1).
export const HomePage = () => {
  const router = useRouter();
  const ready = useAppReady();
  // Под прелоадером до перехода: удержание ленты ставится в том же коммите.
  usePreloaderHold("home", true);

  useEffect(() => {
    if (ready) router.replace(ROUTES.GIFTS);
  }, [ready, router]);

  return <Splash />;
};
