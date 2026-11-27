"use client";

import { usePathname } from "next/navigation";

import { GiftsPageSkeleton } from "@/pages/gifts";
import { PickInvitePageSkeleton } from "@/pages/pick-invite";
import { PlanJoinPageSkeleton } from "@/pages/plan-join";
import { SantaJoinPageSkeleton } from "@/pages/santa-join";
import { WishlistGuestPageSkeleton } from "@/pages/wishlist-guest";

import { ScreenSkeleton } from "@/shared/ui";

// Без хвостового «/»: usePathname в разных режимах отдаёт его по-разному.
const normalize = (pathname: null | string) =>
  !pathname || pathname === "/" ? "/" : pathname.replace(/\/+$/, "");

// Скелетон экрана, пока вкладка запускается (режим, сессия) или создаётся
// профиль — вместо логотипа по центру (DESIGN.md §6 «Прелоадер»: после
// прелоадера никогда не бывает неподвижного экрана). Лента и экраны, которые
// открывают по ссылке первыми, — со своей разметкой; остальные — общий.
// Он же попадает в статический HTML этих страниц.
export const RouteSkeleton = () => {
  switch (normalize(usePathname())) {
    case "/":
    case "/gifts":
    case "/onboarding":
      return <GiftsPageSkeleton />;
    case "/w":
      return <WishlistGuestPageSkeleton />;
    case "/pick":
      return <PickInvitePageSkeleton />;
    case "/plans/join":
      return <PlanJoinPageSkeleton />;
    case "/santa/join":
      return <SantaJoinPageSkeleton />;
    default:
      return <ScreenSkeleton />;
  }
};
