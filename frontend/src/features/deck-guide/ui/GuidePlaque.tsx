"use client";

import { NetworkPlaque } from "@/entities/user";

import { useAppMode } from "@/shared/lib/app-status";

// Плашка на обучающей карточке (DESIGN.md §7 DeckGuide): про демо — в local,
// плашка сети — в lan (§8.11). Переехала с бывшего первого экрана.
export const GuidePlaque = () => {
  if (useAppMode() === "lan") return <NetworkPlaque />;
  return (
    <p className="bg-paper-2 text-caption text-ink-soft rounded-[12px] px-3 py-2">
      Это демо: всё хранится только в твоём браузере, а друзья внутри —
      демо-боты
    </p>
  );
};
