"use client";

import type { CSSProperties, ReactNode } from "react";

import { usePathname } from "next/navigation";

import { hasTabBar } from "@/shared/config";
import { useMounted } from "@/shared/lib/dom";
import { Brand, QrCode } from "@/shared/ui";

type Props = {
  children: ReactNode;
  tabBar: ReactNode;
};

// Без таб-бара снизу остаётся только safe-area (полоска «домой» на iPhone).
const NO_TAB_BAR_SPACE = "calc(16px + env(safe-area-inset-bottom))";

// Оболочка (DESIGN.md §4): до 520px приложение во весь экран, шире — в рамке
// телефона 400px по центру, а на широком экране слева логотип и QR текущего
// адреса, чтобы открыть демо на телефоне.
//
// transform на рамке делает её «containing block» для position: fixed —
// шторки, тосты и таб-бар внутри рамки позиционируются относительно неё,
// а не всего окна. На телефоне рамка и есть экран, разницы нет.
export const AppShell = ({ children, tabBar }: Props) => {
  const pathname = usePathname();
  const mounted = useMounted();
  // URL читаем в рендере после монтирования: смена пути перерисовывает
  // оболочку (usePathname), этого достаточно для QR.
  const url = mounted ? window.location.href : "";
  const style = hasTabBar(pathname)
    ? undefined
    : ({ "--tabbar-space": NO_TAB_BAR_SPACE } as CSSProperties);

  return (
    <div className="frame:flex frame:h-dvh frame:items-center frame:justify-center frame:gap-20 frame:p-6">
      <aside className="wide:flex hidden w-[320px] flex-col gap-6">
        <Brand size="lg" />
        <p className="text-title-3 text-rose">
          Свайпай подарки, которые хочешь сам. Друзья увидят — и угадают с
          подарком.
        </p>
        <div className="mt-4 flex items-center gap-5">
          <QrCode
            value={url}
            label="QR-код этой страницы"
            className="size-[132px] shrink-0"
          />
          <p className="text-label text-paper">
            Открой на телефоне: наведи камеру на код
          </p>
        </div>
      </aside>

      <div
        id="app-frame"
        style={style}
        className="bg-velvet frame:relative frame:inset-auto frame:h-[min(860px,calc(100dvh-48px))] frame:w-[400px] frame:shrink-0 frame:rounded-[44px] frame:shadow-[0_0_0_1px_var(--color-line),0_50px_90px_-30px_rgb(10_0_8/0.8)] fixed inset-0 isolate overflow-hidden transform-[translateZ(0)]"
      >
        {/* Слой 2 бархата: свет на ткани. Слой 3: зерно (DESIGN.md §2) */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-(image:--sheen)"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 z-[200] bg-(image:--grain) opacity-5 mix-blend-overlay"
        />
        <div className="relative h-full">{children}</div>
        {tabBar}
        {/* Сюда порталами попадают шторки, диалоги и тосты (T03) */}
        <div id="overlay-root" />
      </div>
    </div>
  );
};
