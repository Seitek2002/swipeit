"use client";

import { type ReactNode, useEffect } from "react";

import { usePathname, useRouter } from "next/navigation";

import { useMe } from "@/entities/user";

import { isApiError } from "@/shared/api";
import { ROUTES, requiresProfile } from "@/shared/config";
import { useAppReady } from "@/shared/lib/app-status";
import { useMounted } from "@/shared/lib/dom";
import { useSessionStore } from "@/shared/store";
import { Splash } from "@/shared/ui";

// Экраны с профилем без профиля не открываются — ведём в онбординг
// (TECH_SPEC §10). Профиль пропал из базы (сброс в другой вкладке, порча
// хранилища) — сессия вкладки очищается, и тоже в онбординг. Гостевые экраны
// (чужой вишлист по ссылке и т. п.) открываются без профиля.
export const SessionGate = ({ children }: { children: ReactNode }) => {
  const pathname = usePathname();
  const router = useRouter();
  const mounted = useMounted();
  // До запуска вкладки сессия ещё не прочитана (skipHydration): userId пуст
  // у любого, и без этой проверки вошедшего увело бы в онбординг.
  const ready = useAppReady();
  const userId = useSessionStore((state) => state.activeUserId);
  const setActiveUser = useSessionStore((state) => state.setActiveUser);
  const me = useMe();
  const needsProfile = requiresProfile(pathname);
  const profileMissing = isApiError(me.error) && me.error.code === "NOT_FOUND";

  useEffect(() => {
    if (profileMissing) setActiveUser(null);
  }, [profileMissing, setActiveUser]);

  useEffect(() => {
    if (ready && mounted && needsProfile && !userId) {
      router.replace(ROUTES.ONBOARDING);
    }
  }, [ready, mounted, needsProfile, userId, router]);

  if (needsProfile && (!ready || !mounted || !userId)) return <Splash />;
  return children;
};
