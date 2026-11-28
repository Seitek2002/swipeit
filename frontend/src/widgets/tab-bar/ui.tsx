"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { Gift, Heart, type LucideIcon, Mail, Ticket } from "lucide-react";

import { useWishlistSummary } from "@/entities/wishlist";

import { ROUTES, type TabId, getActiveTab, hasTabBar } from "@/shared/config";
import { cn } from "@/shared/lib/utils";

type Props = {
  // В каком-то плане ждут меня (Q09): не долистал, не проголосовал, итоги.
  plansNeedMe?: boolean;
  // Организатору пора провести жеребьёвку (UX-аудит X10).
  santaDrawDue?: boolean;
  // Письмо Санты ждёт вскрытия.
  santaReady?: boolean;
  // Активное напоминание о своей дате (DESIGN.md §7 ReminderBanner, §8.3).
  wishlistReminder?: boolean;
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
export const TabBar = ({
  santaReady = false,
  santaDrawDue = false,
  plansNeedMe = false,
  wishlistReminder = false,
}: Props) => {
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
              {/* Напоминание — мандариновая точка 6px слева сверху: справа
                  сверху место бейджа (DESIGN.md §7 ReminderBanner). */}
              {id === "wishlist" && wishlistReminder && (
                <b
                  aria-hidden
                  className="bg-mandarin absolute -top-[3px] -left-[9px] size-1.5 rounded-full shadow-[0_0_0_2px_var(--color-velvet-2)]"
                />
              )}
              {id === "plans" && plansNeedMe && (
                <b
                  aria-hidden
                  className="bg-mandarin absolute -top-0.5 -right-0.5 size-2 rounded-full shadow-[0_0_0_2px_var(--color-velvet-2)]"
                />
              )}
              {id === "santa" && (santaReady || santaDrawDue) && (
                <b
                  aria-hidden
                  className="bg-mandarin absolute -top-0.5 -right-0.5 size-2 rounded-full shadow-[0_0_0_2px_var(--color-velvet-2)]"
                />
              )}
            </span>
            <span className="text-micro">{label}</span>
            {id === "wishlist" && wishlistReminder && (
              <span className="sr-only">, есть напоминание</span>
            )}
            {id === "plans" && plansNeedMe && (
              <span className="sr-only">, тебя ждут в плане</span>
            )}
            {/* Причину точки — текстом в имени ссылки, как у «Планов»:
                aria-label у <b> без роли диктор может пропустить. */}
            {id === "santa" && santaReady && (
              <span className="sr-only">, конверт готов</span>
            )}
            {id === "santa" && santaDrawDue && (
              <span className="sr-only">, пора провести жеребьёвку</span>
            )}
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
