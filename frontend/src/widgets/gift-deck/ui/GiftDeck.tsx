"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { useQueryClient } from "@tanstack/react-query";

import { ProductDetailsSheet } from "@/features/product-details";
import {
  SwipeDeck,
  type SwipeDeckHandle,
  type SwipeDirection,
} from "@/features/swipe-deck";

import {
  GiftTagCard,
  GiftTagSkeleton,
  type Product,
  type ProductFilters,
} from "@/entities/product";
import { useWishlistSummary } from "@/entities/wishlist";

import {
  type SwipeContext,
  type SwipeDecision,
  createSwipe,
  getFeed,
  restartSwipes,
  undoSwipe,
  wishlistKeys,
} from "@/shared/api";
import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice } from "@/shared/lib/format";
import { Button, EmptyState, toast } from "@/shared/ui";

import { RIBBON_SEGMENTS, WishRibbon } from "./WishRibbon";
import { WishlistReadySheet } from "./WishlistReadySheet";

type Props = {
  context?: SwipeContext;
  filters: ProductFilters;
  hidePrices?: boolean;
  // В ленте «Выбери подарок сам» (T10) нет ленты вишлиста и банта.
  hideRibbon?: boolean;
  onEditFilters?: () => void;
  // Свайп засчитан — например, для счётчика «Хочу» в ссылке-фильтре.
  onLike?: (product: Product, direction: SwipeDirection) => void;
};

const DECISIONS: Record<SwipeDirection, SwipeDecision> = {
  left: "pass",
  right: "like",
  up: "superlike",
};

const PAGE_SIZE = 10;
// Бант рисуется 0.6 с и пару раз качается — шторка открывается после него.
const BOW_DURATION_MS = 1400;

const contextKeyOf = (context: SwipeContext) =>
  context.kind === "self" ? "self" : `pick:${context.requestId}`;

const isLike = (direction: SwipeDirection) => direction !== "left";

// Колода подарков (TASKS T07) на движке SwipeDeck: лента из /catalog/feed с
// дозагрузкой, решения в /swipes, «Вернуть», конец колоды, лента вишлиста.
//
// Очередь карточек — локальное состояние колоды (TECH_SPEC §9): это не копия
// ответа сервера, а то, что ещё лежит на столе. Сервер — источник правды о
// свайпах; колода только убирает и возвращает карточки.
export const GiftDeck = ({
  filters,
  context = { kind: "self" },
  hidePrices = false,
  hideRibbon = false,
  onEditFilters,
  onLike,
}: Props) => {
  const queryClient = useQueryClient();
  const summary = useWishlistSummary();
  const deckRef = useRef<SwipeDeckHandle>(null);
  const contextKey = contextKeyOf(context);

  const [queue, setQueue] = useState<Product[]>([]);
  const [history, setHistory] = useState<
    Array<{ direction: SwipeDirection; product: Product }>
  >([]);
  const [status, setStatus] = useState<
    "error" | "exhausted" | "idle" | "loading"
  >("loading");
  const [likes, setLikes] = useState<null | number>(null);
  const [drawingBow, setDrawingBow] = useState(false);
  const [readyOpen, setReadyOpen] = useState(false);
  const [details, setDetails] = useState<null | Product>(null);

  // Запросы свайпов — строго по очереди: «Вернуть» не должно обогнать сам
  // свайп (у мока случайная задержка 150–450 ms).
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  function enqueue<T>(task: () => Promise<T>) {
    const run = chain.current.then(task);
    chain.current = run.catch(() => undefined);
    return run;
  }
  // Номер «поколения» колоды: смена фильтров отбрасывает ответы старых.
  const epoch = useRef(0);
  const loading = useRef(false);
  const variants = useRef<Record<string, Record<string, string>>>({});

  const likeCount = likes ?? summary.likeCount;
  const showRibbon =
    !hideRibbon && summary.isLoaded && (!summary.shareUnlocked || drawingBow);

  const loadMore = useCallback(
    async (current: Product[], reset = false) => {
      if (loading.current && !reset) return;
      loading.current = true;
      const myEpoch = epoch.current;
      try {
        const page = await getFeed({
          filters,
          context: contextKey,
          limit: PAGE_SIZE,
          exclude: current.map((product) => product.id),
        });
        if (myEpoch !== epoch.current) return;
        setQueue((queueNow) => {
          const known = new Set(queueNow.map((product) => product.id));
          return [
            ...queueNow,
            ...page.items.filter((product) => !known.has(product.id)),
          ];
        });
        setStatus(page.total <= page.items.length ? "exhausted" : "idle");
      } catch {
        if (myEpoch === epoch.current) setStatus("error");
      } finally {
        if (myEpoch === epoch.current) loading.current = false;
      }
    },
    [filters, contextKey],
  );

  // Новые фильтры — колода заново. Сброс состояния — во время рендера
  // (а не в эффекте): иначе на кадр мелькнула бы старая колода.
  const deckKey = `${contextKey}:${JSON.stringify(filters)}`;
  const [shownKey, setShownKey] = useState(deckKey);
  if (shownKey !== deckKey) {
    setShownKey(deckKey);
    setQueue([]);
    setHistory([]);
    setStatus("loading");
  }

  useEffect(() => {
    epoch.current += 1;
    loading.current = false;
    // Запуск в следующей задаче: эффект не меняет состояние синхронно, а
    // двойной вызов эффекта в StrictMode не даёт двух запросов.
    const timer = setTimeout(() => void loadMore([], true), 0);
    return () => clearTimeout(timer);
  }, [loadMore]);

  // Картинки двух следующих карточек — заранее (TECH_SPEC §6, п. 4).
  useEffect(() => {
    queue.slice(1, 3).forEach((product) => {
      const src = product.images[0]?.src;
      if (src) new Image().src = withBasePath(src);
    });
  }, [queue]);

  const handleNeedMore = () => {
    if (status === "idle") void loadMore(queue);
  };

  const handleDecision = (product: Product, direction: SwipeDirection) => {
    setQueue((current) => current.filter((item) => item.id !== product.id));
    setHistory((current) => [...current, { product, direction }]);
    if (isLike(direction)) {
      setLikes((count) => (count ?? summary.likeCount) + 1);
      onLike?.(product, direction);
    }
    const variantChoice = variants.current[product.id];
    enqueue(() =>
      createSwipe({
        productId: product.id,
        decision: DECISIONS[direction],
        context,
        variantChoice,
      }),
    ).then(
      (response) => {
        setLikes(response.likeCount);
        if (response.shareJustUnlocked && !hideRibbon) {
          setDrawingBow(true);
          setTimeout(() => {
            setDrawingBow(false);
            setReadyOpen(true);
          }, BOW_DURATION_MS);
        }
        void queryClient.invalidateQueries({ queryKey: wishlistKeys.all });
      },
      () => {
        toast("Не получилось сохранить. Карточка вернулась", { tone: "error" });
        setQueue((current) => [product, ...current]);
        setHistory((current) =>
          current.filter((entry) => entry.product.id !== product.id),
        );
        if (isLike(direction))
          setLikes((count) => Math.max(0, (count ?? 1) - 1));
      },
    );
  };

  const handleUndo = () => {
    const last = history[history.length - 1];
    if (!last) return;
    setHistory((current) => current.slice(0, -1));
    setQueue((current) => [last.product, ...current]);
    if (isLike(last.direction))
      setLikes((count) => Math.max(0, (count ?? 1) - 1));
    enqueue(() => undoSwipe(context)).then(
      (response) => {
        setLikes(response.likeCount);
        void queryClient.invalidateQueries({ queryKey: wishlistKeys.all });
      },
      () => toast("Не получилось вернуть", { tone: "error" }),
    );
  };

  const handleRestart = () => {
    setStatus("loading");
    enqueue(() => restartSwipes(context)).then(
      () => {
        epoch.current += 1;
        setHistory([]);
        void loadMore([], true);
      },
      () => {
        setStatus("exhausted");
        toast("Не получилось начать заново", { tone: "error" });
      },
    );
  };

  const handleDetailsDecision = (
    direction: "left" | "right",
    variantChoice?: Record<string, string>,
  ) => {
    if (details && variantChoice) variants.current[details.id] = variantChoice;
    setDetails(null);
    // Шторка уезжает 220ms — потом карточка улетает той же анимацией свайпа.
    setTimeout(() => deckRef.current?.swipe(direction), 240);
  };

  const empty =
    status === "loading" ? (
      <div className="mt-[34px] mb-4 h-[calc(100%-50px)] w-[min(100%,calc((100%-50px)*0.74))] max-w-full">
        <GiftTagSkeleton />
      </div>
    ) : status === "error" ? (
      <EmptyState
        title="Не получилось загрузить подарки. Проверь связь и попробуй ещё раз."
        action={
          <Button
            variant="secondary"
            onClick={() => {
              setStatus("loading");
              void loadMore([], true);
            }}
          >
            Попробовать ещё раз
          </Button>
        }
      />
    ) : (
      <EmptyState
        title="Ты посмотрел всё в этих фильтрах"
        action={
          <>
            {onEditFilters && (
              <Button variant="secondary" onClick={onEditFilters}>
                Изменить фильтры
              </Button>
            )}
            <Button variant="ghost" onClick={handleRestart}>
              Начать заново
            </Button>
          </>
        }
      />
    );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {showRibbon && (
        <WishRibbon
          likes={drawingBow ? RIBBON_SEGMENTS : likeCount}
          drawingBow={drawingBow}
          onBowDone={() => undefined}
        />
      )}
      <SwipeDeck
        handleRef={deckRef}
        items={queue}
        getKey={(product) => product.id}
        getLabel={(product) =>
          hidePrices
            ? product.title
            : `${product.title}, ${formatPrice(product.priceMin, product.priceMax)}`
        }
        renderCard={(product, { isTop }) => (
          <GiftTagCard
            product={product}
            isTop={isTop}
            hidePrices={hidePrices}
            onOpenDetails={() => setDetails(product)}
          />
        )}
        onDecision={handleDecision}
        onUndo={handleUndo}
        canUndo={history.length > 0}
        onNeedMore={handleNeedMore}
        onOpen={setDetails}
        announce={(product, direction) =>
          direction === "left"
            ? `Мимо: ${product.title}`
            : context.kind === "self"
              ? `Добавлено в вишлист: ${product.title}`
              : `Выбрано: ${product.title}`
        }
        empty={empty}
      />
      <ProductDetailsSheet
        product={details}
        hidePrices={hidePrices}
        onClose={() => setDetails(null)}
        onDecide={handleDetailsDecision}
      />
      <WishlistReadySheet
        open={readyOpen}
        count={summary.activeCount}
        onClose={() => setReadyOpen(false)}
      />
    </div>
  );
};
