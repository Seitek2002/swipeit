"use client";

import type { ReactNode } from "react";

import Link from "next/link";
import { useRouter } from "next/navigation";

import { ChevronLeft } from "lucide-react";

import { ROUTES } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

type Props = {
  actions?: ReactNode;
  // Куда ведёт «назад». Без адреса — шаг назад по истории.
  backHref?: string;
  className?: string;
  showAvatar?: boolean;
  showBack?: boolean;
  title: ReactNode;
};

// Шапка экрана (DESIGN.md §7 AppHeader): 56px, прозрачная. Слева заголовок
// title-1 или «назад» + заголовок, справа до двух действий и аватар-вход в
// профиль. Аватар пока заглушка — настоящий появится вместе с профилем (T05).
export const AppHeader = ({
  title,
  showBack = false,
  backHref,
  actions,
  showAvatar = true,
  className,
}: Props) => {
  const router = useRouter();

  const handleBack = () => {
    if (backHref) router.push(backHref);
    else router.back();
  };

  return (
    <header
      className={cn(
        "flex h-14 flex-none items-center gap-1 pr-4",
        showBack ? "pl-2" : "pl-5",
        className,
      )}
    >
      {showBack && (
        <button
          type="button"
          onClick={handleBack}
          aria-label="Назад"
          className="text-paper grid size-11 flex-none place-items-center rounded-full transition-transform active:scale-[0.94]"
        >
          <ChevronLeft aria-hidden size={24} strokeWidth={1.75} />
        </button>
      )}
      <h1 className="text-title-1 min-w-0 flex-1 truncate">{title}</h1>
      <div className="flex items-center gap-1">
        {actions}
        {showAvatar && (
          <Link
            href={ROUTES.PROFILE}
            aria-label="Профиль"
            className="grid size-11 place-items-center rounded-full"
          >
            <span className="bg-avatar-plum text-ink grid size-9 place-items-center rounded-full text-[15px] font-semibold">
              ?
            </span>
          </Link>
        )}
      </div>
    </header>
  );
};
