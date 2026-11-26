"use client";

import { useEffect } from "react";

import { useRouter } from "next/navigation";

import { ROUTES } from "@/shared/config";

// Вход «/». Пока профиля нет (T05) — сразу в ленту подарков. В T05 сюда
// добавится проверка: без профиля — в онбординг (TECH_SPEC §10).
export const HomePage = () => {
  const router = useRouter();

  useEffect(() => {
    router.replace(ROUTES.GIFTS);
  }, [router]);

  return null;
};
