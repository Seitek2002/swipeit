"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Gift, Heart, type LucideIcon, Mail, Ticket } from "lucide-react";

import { useWishlistSummary } from "@/entities/wishlist";

import { ROUTES, type TabId, getActiveTab, hasTabBar } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

type Props = {
  santaReady?: boolean;
};

type Tab = {
  href: string;
  icon: LucideIcon;
  id: TabId;
  label: string;
};

// DESIGN.md §5: иконки табов — семья бумажных вещей.
const TABS: Tab[] = [
  { id: "gifts", href: ROUTES.GIFTS, label: "Подарки", icon: Gift },
  { id: "wishlist", href: ROUTES.WISHLIST, label: "Вишлист", icon: Heart },
  { id: "plans", href: ROUTES.PLANS, label: "Планы", icon: Ticket },
  { id: "santa", href: ROUTES.SANTA, label: "Санта", icon: Mail },
];

// Плавающая таблетка (DESIGN.md §7 TabBar). Активный таб — «Бумага» и
// мандариновая точка 4px; бейджи — бумага с чернилами, не мандарин.
export const TabBar = ({ santaReady = false }: Props) => {
  const pathname = usePathname();
  // Бейдж — число активных желаний (DESIGN.md §7 TabBar).
  const wishCount = useWishlistSummary().activeCount;
  if (!hasTabBar(pathname)) return null;
  const active = getActiveTab(pathname);

  return (
    <nav
      aria-label="Разделы"
      className="border-line bg-velvet-2/84 rounded-chip absolute inset-x-3 bottom-[max(12px,calc(env(safe-area-inset-bottom)-14px))] z-40 grid h-16 grid-cols-4 border shadow-[0_16px_40px_-16px_rgb(10_0_8/0.7)] backdrop-blur-[16px] backdrop-saturate-[1.2]"
    >
      {TABS.map(({ id, href, label, icon: Icon }) => {
        const isActive = id === active;
        return (
          <Link
            key={id}
            href={href}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "rounded-chip relative flex flex-col items-center justify-center gap-[3px]",
              isActive ? "text-paper" : "text-rose",
            )}
          >
            <span className="relative grid place-items-center">
              <Icon aria-hidden size={22} strokeWidth={1.75} />
              {id === "wishlist" && wishCount > 0 && (
                <b className="text-micro bg-paper text-ink absolute -top-[7px] -right-[13px] h-[18px] min-w-[18px] rounded-[9px] px-[5px] text-center leading-[18px] shadow-[0_0_0_2px_var(--color-velvet-2)]">
                  {wishCount}
                </b>
              )}
              {id === "santa" && santaReady && (
                <b
                  aria-label="Конверт готов"
                  className="bg-mandarin absolute -top-0.5 -right-0.5 size-2 rounded-full shadow-[0_0_0_2px_var(--color-velvet-2)]"
                />
              )}
            </span>
            <span className="text-micro">{label}</span>
            {isActive && (
              <span
                aria-hidden="true"
                className="bg-mandarin absolute bottom-[5px] size-1 rounded-full"
              />
            )}
          </Link>
        );
      })}
    </nav>
  );
};
