"use client";

import { useState } from "react";

import { GiftCard } from "@/widgets/gift-deck";

import { SwipeDeck, type SwipeDirection } from "@/features/swipe-deck";

import {
  EMPTY_FILTERS,
  GiftCardSkeleton,
  type Product,
  useFeedPage,
} from "@/entities/product";

import { Button } from "@/shared/ui";

const RESULT: Record<SwipeDirection, string> = {
  right: "Хочу",
  left: "Мимо",
  up: "Очень хочу",
};

// Фото-колода подарков (T19b) на настоящих карточках каталога, но без
// запросов /swipes: решения только пишутся в строку под заголовком.
export const GiftCardDemo = () => {
  const feed = useFeedPage(EMPTY_FILTERS);
  const [done, setDone] = useState<
    Array<{ direction: SwipeDirection; product: Product }>
  >([]);
  const swiped = new Set(done.map((entry) => entry.product.id));
  const queue = (feed.data?.items ?? []).filter(
    (product) => !swiped.has(product.id),
  );
  const last = done[done.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-rose" data-testid="gift-deck-log">
        {last
          ? `${last.product.title}: ${RESULT[last.direction]}`
          : "Свайпай вбок, прокручивай вниз"}
      </p>
      <div className="relative -mx-5 flex h-[640px] flex-col">
        {feed.isPending ? (
          <div className="relative mx-4 mt-3 flex-1">
            <GiftCardSkeleton />
          </div>
        ) : (
          <SwipeDeck
            items={queue}
            getKey={(product) => product.id}
            getLabel={(product) => product.title}
            onDecision={(product, direction) =>
              setDone((current) => [...current, { product, direction }])
            }
            onUndo={() => {
              const previous = done[done.length - 1];
              if (!previous) return null;
              setDone((current) => current.slice(0, -1));
              return {
                key: previous.product.id,
                direction: previous.direction,
              };
            }}
            canUndo={done.length > 0}
            empty={
              <Button variant="secondary" onClick={() => setDone([])}>
                Начать сначала
              </Button>
            }
            renderPhotoCard={(product) => (
              <GiftCard product={product} onVariantChange={() => undefined} />
            )}
          />
        )}
      </div>
    </div>
  );
};
