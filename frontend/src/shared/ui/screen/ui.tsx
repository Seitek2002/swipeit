import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

type Props = {
  children: ReactNode;
  className?: string;
};

// Каркас экрана: шапка сверху, прокручиваемое тело. Экран занимает всю рамку
// приложения, прокручивается только тело — так шапка и таб-бар стоят на месте
// и в рамке телефона на десктопе, и на настоящем телефоне.
export const Screen = ({ children, className }: Props) => (
  <div
    className={cn(
      "flex h-full flex-col pt-[env(safe-area-inset-top)]",
      className,
    )}
  >
    {children}
  </div>
);

// Отступ снизу — под плавающий таб-бар (--tabbar-space ставит оболочка, на
// экранах без таб-бара это только safe-area), чтобы последний элемент списка
// не прятался под таблеткой.
export const ScreenBody = ({ children, className }: Props) => (
  <div
    data-scroll-root
    className={cn(
      "no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain pb-[var(--tabbar-space)]",
      className,
    )}
  >
    {children}
  </div>
);
