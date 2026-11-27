"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { ROUTES } from "@/shared/config";
import { Splash } from "@/shared/ui";

// Анкеты на входе больше нет (DESIGN.md §8.1): старый адрес /onboarding/
// ведёт в ленту — профиль создастся сам под прелоадером.
export const OnboardingRedirect = () => {
  const router = useRouter();
  useEffect(() => {
    router.replace(ROUTES.GIFTS);
  }, [router]);
  return <Splash />;
};
