"use client";

import { useEffect, useRef, useState } from "react";

import { useRouter } from "next/navigation";

import { Gift, X } from "lucide-react";

import { useProducts } from "@/entities/product";
import {
  type SantaNudge,
  santaWishlistNudge,
  useSantaGames,
} from "@/entities/santa-game";
import { useMyWishlist } from "@/entities/wishlist";

import { ROUTES } from "@/shared/config";
import { formatPrice } from "@/shared/lib/format";
import { useSessionStore } from "@/shared/store";
import { Chip, toast } from "@/shared/ui";

// Моя игра Санты, где мне мало желаний в бюджете (auto-tasks-pm-3 R06).
export const useSantaNudge = (): null | SantaNudge => {
  const meId = useSessionStore((state) => state.activeUserId);
  const games = useSantaGames();
  const wishlist = useMyWishlist();
  const active = (wishlist.data?.items ?? []).filter(
    (item) => item.status === "active",
  );
  const products = useProducts(
    active.flatMap((item) =>
      item.source.kind === "product" ? [item.source.productId] : [],
    ),
  );
  if (!games.data || !wishlist.data) return null;
  const prices = active.map((item) =>
    item.source.kind === "product"
      ? (products.get(item.source.productId)?.priceMin ?? null)
      : (item.source.custom.priceMin ?? item.source.custom.priceMax ?? null),
  );
  return santaWishlistNudge(games.data, meId, prices);
};

const HIDDEN_KEY = "swipeit:santa-nudge-hidden";

const readHidden = (): null | string => {
  try {
    return window.sessionStorage.getItem(HIDDEN_KEY);
  } catch {
    return null;
  }
};

// Плашка над колодой «Подарков» (R06): бюджет игры одним тапом, крестик —
// до конца сессии. Когда желаний в бюджете стало достаточно — тост с
// возвратом к игре.
export const SantaNudgeBanner = ({
  onBudget,
}: {
  onBudget: (max: number) => void;
}) => {
  const router = useRouter();
  const nudge = useSantaNudge();
  const [hidden, setHidden] = useState<null | string>(() =>
    typeof window === "undefined" ? null : readHidden(),
  );
  // Подсказка была и пропала — в бюджете уже три желания.
  const last = useRef<null | SantaNudge>(null);
  useEffect(() => {
    const was = last.current;
    last.current = nudge;
    if (was && !nudge) {
      toast(`Твой Санта в «${was.title}» уже увидит эти желания`, {
        action: {
          label: "Вернуться к игре",
          onClick: () => router.push(ROUTES.SANTA_GAME(was.gameId)),
        },
      });
    }
  }, [nudge, router]);

  if (!nudge || hidden === nudge.gameId) return null;
  return (
    <div className="paper rounded-paper shadow-paper mx-5 mb-2 flex items-start gap-3 px-4 py-3">
      <Gift
        aria-hidden
        size={20}
        strokeWidth={1.75}
        className="text-mandarin-ink mt-0.5 flex-none"
      />
      <div className="min-w-0 flex-1">
        <p className="text-caption text-ink">
          Для Тайного Санты «{nudge.title}»: бюджет до{" "}
          {formatPrice(nudge.budget)}. Твой Санта увидит то, что ты отметишь
          «Хочу»
        </p>
        <Chip className="mt-2" onClick={() => onBudget(nudge.budget)}>
          Подарки до {formatPrice(nudge.budget)}
        </Chip>
      </div>
      <button
        type="button"
        aria-label="Скрыть подсказку"
        onClick={() => {
          try {
            window.sessionStorage.setItem(HIDDEN_KEY, nudge.gameId);
          } catch {
            // Без хранилища — скрываем до перезагрузки.
          }
          setHidden(nudge.gameId);
        }}
        className="text-ink-soft -mt-1 -mr-2 grid size-11 flex-none place-items-center"
      >
        <X aria-hidden size={18} strokeWidth={1.75} />
      </button>
    </div>
  );
};
