"use client";

import { type ReactNode, useEffect } from "react";

import { useRouter } from "next/navigation";

import { ROUTES } from "@/shared/config";

// Анкеты на входе больше нет (DESIGN.md §8.1): старый адрес /onboarding/
// ведёт в ленту — профиль создастся сам под прелоадером. До перехода —
// скелетон ленты (передаёт app/onboarding/page.tsx), а не логотип.
export const OnboardingRedirect = ({ skeleton }: { skeleton: ReactNode }) => {
  const router = useRouter();
  useEffect(() => {
    router.replace(ROUTES.GIFTS);
  }, [router]);
  return skeleton;
};
