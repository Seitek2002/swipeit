"use client";

import { useState } from "react";

import { SwipeDeck, type SwipeDirection } from "@/features/swipe-deck";

import { Button } from "@/shared/ui";

type DemoCard = { id: string; tint: string; title: string };

const TINTS = ["mint", "champagne", "rose", "mandarin", "avatar-plum"];

const makeCards = (): DemoCard[] =>
  Array.from({ length: 10 }, (_, index) => ({
    id: `demo-${index + 1}`,
    title: `Карточка ${index + 1}`,
    tint: TINTS[index % TINTS.length] ?? "mint",
  }));

const RESULT: Record<SwipeDirection, string> = {
  right: "Хочу",
  left: "Мимо",
  up: "Очень хочу",
};

// Проверка движка колоды (T06) на заглушках: 10 цветных бирок.
export const DeckDemo = () => {
  const [queue, setQueue] = useState(makeCards);
  const [done, setDone] = useState<
    Array<{ card: DemoCard; direction: SwipeDirection }>
  >([]);

  const handleDecision = (card: DemoCard, direction: SwipeDirection) => {
    setQueue((current) => current.filter((item) => item.id !== card.id));
    setDone((current) => [...current, { card, direction }]);
  };

  const handleUndo = () => {
    const last = done[done.length - 1];
    if (!last) return;
    setDone((current) => current.slice(0, -1));
    setQueue((current) => [last.card, ...current]);
  };

  const lastResult = done[done.length - 1];

  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-rose" data-testid="deck-log">
        {lastResult
          ? `${lastResult.card.title}: ${RESULT[lastResult.direction]}. Осталось ${queue.length}`
          : `Осталось ${queue.length}`}
      </p>
      <div className="-mx-5 flex h-[560px] flex-col">
        <SwipeDeck
          items={queue}
          getKey={(card) => card.id}
          getLabel={(card) => card.title}
          onDecision={handleDecision}
          onUndo={handleUndo}
          canUndo={done.length > 0}
          announce={(card, direction) => `${card.title}: ${RESULT[direction]}`}
          empty={
            <Button
              variant="secondary"
              onClick={() => {
                setQueue(makeCards());
                setDone([]);
              }}
            >
              Начать сначала
            </Button>
          }
          renderCard={(card) => (
            <div className="paper rounded-paper flex h-full flex-col p-2.5 pt-[34px] shadow-[0_1px_0_rgb(255_255_255/0.6)_inset] [mask:radial-gradient(circle_7px_at_50%_17px,#0000_96%,#000_100%)] before:border-paper-2 before:absolute before:top-[17px] before:left-1/2 before:-mt-3 before:-ml-3 before:size-6 before:rounded-full before:border-[3px] before:content-['']">
              <div
                className="flex-1 rounded-2xl"
                style={{
                  background: `linear-gradient(165deg, color-mix(in srgb, var(--color-${card.tint}) 60%, var(--color-paper)), var(--color-paper-2))`,
                }}
              />
              <p className="text-title-2 px-1.5 pt-3">{card.title}</p>
              <p className="text-price px-1.5 pt-1.5 pb-1">1 000 сом</p>
            </div>
          )}
        />
      </div>
    </div>
  );
};
