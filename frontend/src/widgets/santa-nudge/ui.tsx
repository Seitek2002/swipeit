"use client";

import { type ReactNode, useEffect, useId, useRef, useState } from "react";

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
import { Chip, IconButton, toast } from "@/shared/ui";

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
// Игры, где полный текст плашки уже показали сам (первый показ, Y03).
const INTRO_KEY = "swipeit:santa-nudge-intro";
const FULL_TEXT_MS = 3000;

const readHidden = (): null | string => {
  try {
    return window.sessionStorage.getItem(HIDDEN_KEY);
  } catch {
    return null;
  }
};

// Первый показ плашки этой игры: отмечаем сразу — перезагрузка его не
// повторит. Хранилища нет — показываем, как впервые.
const takeFirstShow = (gameId: string): boolean => {
  try {
    const raw = window.localStorage.getItem(INTRO_KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    const seen = Array.isArray(list) ? list : [];
    if (seen.includes(gameId)) return false;
    window.localStorage.setItem(
      INTRO_KEY,
      JSON.stringify([...seen, gameId].slice(-20)),
    );
    return true;
  } catch {
    return true;
  }
};

type Options = {
  // Верхняя граница бюджета в фильтрах «Подарков» (null — без границы).
  budgetMax: null | number;
  onBudget: (max: number) => void;
};

type SantaNudgeBannerApi = {
  // Плашка над колодой: одна строка, не выше 56 px (Y03).
  banner: ReactNode;
  // Свёрнуть до иконки в шапке — после первого свайпа.
  collapse: () => void;
  // Иконка в шапке, пока плашка свёрнута.
  headerAction: ReactNode;
};

// Плашка Санты над колодой «Подарков» (R06, UX-аудит Y03): одна строка
// «Для „Тест 2“: до 2 000 сом» — бюджет чипом, пока фильтр не включён, и
// крестик (до конца сессии). Полный текст — в первый показ и по нажатию на
// строку, на 3 секунды, поверх колоды: карточка не сжимается. После первого
// свайпа плашка сворачивается до иконки в шапке. Когда желаний в бюджете
// стало достаточно — тост с возвратом к игре.
export const useSantaNudgeBanner = ({
  budgetMax,
  onBudget,
}: Options): SantaNudgeBannerApi => {
  const router = useRouter();
  const nudge = useSantaNudge();
  const fullId = useId();
  const [hidden, setHidden] = useState<null | string>(() =>
    typeof window === "undefined" ? null : readHidden(),
  );
  const [collapsed, setCollapsed] = useState(false);
  const [fullShown, setFullShown] = useState(false);
  const fullTimer = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  const showFull = () => {
    clearTimeout(fullTimer.current);
    setFullShown(true);
    fullTimer.current = setTimeout(() => setFullShown(false), FULL_TEXT_MS);
  };
  const hideFull = () => {
    clearTimeout(fullTimer.current);
    setFullShown(false);
  };
  useEffect(() => () => clearTimeout(fullTimer.current), []);

  const visible = Boolean(nudge) && hidden !== nudge?.gameId;
  const gameId = visible ? nudge?.gameId : undefined;
  // Первый показ плашки этой игры — полный текст сам, на 3 секунды. Решение
  // «первый ли» — в ref: повторный запуск эффекта (StrictMode) его не теряет.
  const intro = useRef<{ first: boolean; gameId: string } | null>(null);
  useEffect(() => {
    if (!gameId) return;
    if (intro.current?.gameId !== gameId) {
      intro.current = { gameId, first: takeFirstShow(gameId) };
    }
    if (!intro.current.first) return;
    const timer = setTimeout(() => {
      intro.current = { gameId, first: false };
      setFullShown(true);
      clearTimeout(fullTimer.current);
      fullTimer.current = setTimeout(() => setFullShown(false), FULL_TEXT_MS);
    }, 0);
    return () => clearTimeout(timer);
  }, [gameId]);

  // Подсказка была и пропала — в бюджете уже три желания. Текст короткий:
  // на 360 px «Вернуться к игре» съедала строку, и он обрезался (Y03).
  const last = useRef<null | SantaNudge>(null);
  useEffect(() => {
    const was = last.current;
    last.current = nudge;
    if (was && !nudge) {
      toast(`Твой Санта в «${was.title}» увидит эти желания`, {
        action: {
          label: "К игре",
          onClick: () => router.push(ROUTES.SANTA_GAME(was.gameId)),
        },
      });
    }
  }, [nudge, router]);

  const collapse = () => {
    if (collapsed) return;
    hideFull();
    setCollapsed(true);
  };

  if (!nudge || !visible) {
    return { banner: null, collapse, headerAction: null };
  }

  const budget = formatPrice(nudge.budget);
  // Фильтр уже не дороже бюджета игры — чип продублировал бы пилюлю
  // «до 2 000 сом ×» под плашкой.
  const budgetOn = budgetMax !== null && budgetMax <= nudge.budget;

  const hide = () => {
    try {
      window.sessionStorage.setItem(HIDDEN_KEY, nudge.gameId);
    } catch {
      // Без хранилища — скрываем до перезагрузки.
    }
    hideFull();
    setHidden(nudge.gameId);
  };

  const headerAction = collapsed ? (
    <IconButton
      label={`Тайный Санта «${nudge.title}»: подарки до ${budget}`}
      onClick={() => {
        setCollapsed(false);
        showFull();
      }}
    >
      <Gift
        aria-hidden
        size={22}
        strokeWidth={1.75}
        className="text-champagne"
      />
    </IconButton>
  ) : null;

  const banner = collapsed ? null : (
    <div className="relative z-20 mx-5 flex-none">
      <div className="paper rounded-paper shadow-paper flex h-12 items-center gap-1 pl-3">
        <button
          type="button"
          aria-expanded={fullShown}
          aria-controls={fullId}
          aria-describedby={fullId}
          onClick={() => (fullShown ? hideFull() : showFull())}
          className="text-ink flex h-full min-w-0 flex-1 items-center gap-2 text-left text-[14px] leading-5 font-semibold"
        >
          <Gift
            aria-hidden
            size={18}
            strokeWidth={1.75}
            className="text-mandarin-ink flex-none"
          />
          {/* Длинное название обрезается, кавычка и бюджет остаются. */}
          <span className="flex min-w-0">
            <span className="flex-none">Для «</span>
            <span className="truncate">{nudge.title}</span>
            <span className="flex-none">»:</span>
          </span>
          {budgetOn && <span className="flex-none">до {budget}</span>}
        </button>
        {!budgetOn && (
          <Chip
            className="h-8"
            aria-label={`Показать подарки до ${budget}`}
            onClick={() => onBudget(nudge.budget)}
          >
            до {budget}
          </Chip>
        )}
        <button
          type="button"
          aria-label="Скрыть подсказку"
          onClick={hide}
          className="text-ink-soft grid size-11 flex-none place-items-center"
        >
          <X aria-hidden size={18} strokeWidth={1.75} />
        </button>
      </div>
      {/* Полный текст — поверх колоды, а не в плашке: карточка не прыгает. */}
      <p
        id={fullId}
        hidden={!fullShown}
        className="paper rounded-paper shadow-paper text-caption text-ink absolute inset-x-0 top-full mt-1.5 px-4 py-3"
      >
        Для Тайного Санты «{nudge.title}»: бюджет до {budget}. Твой Санта увидит
        то, что ты отметишь «Хочу»
      </p>
    </div>
  );

  return { banner, collapse, headerAction };
};
