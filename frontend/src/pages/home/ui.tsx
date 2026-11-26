"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { useMe } from "@/entities/user";

import { ROUTES } from "@/shared/config";
import { useMounted } from "@/shared/lib/dom";
import { useSessionStore } from "@/shared/store";
import { Splash } from "@/shared/ui";

// Вход «/» (TECH_SPEC §10): профиля нет — онбординг, есть — лента подарков.
// Пока решаем — заставка с бантом.
export const HomePage = () => {
  const router = useRouter();
  const mounted = useMounted();
  const userId = useSessionStore((state) => state.activeUserId);
  const me = useMe();

  useEffect(() => {
    if (!mounted) return;
    if (!userId) router.replace(ROUTES.ONBOARDING);
    else if (me.data) router.replace(ROUTES.GIFTS);
  }, [mounted, userId, me.data, router]);

  return <Splash />;
};
