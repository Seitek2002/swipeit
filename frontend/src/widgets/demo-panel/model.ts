"use client";

import { useEffect } from "react";

import { create } from "zustand";

import { getRealtime } from "@/shared/lib/realtime";

export type BotLogEntry = {
  at: number;
  botId: string;
  id: number;
  text: string;
};

const LIMIT = 30;
let nextId = 1;

type BotLogState = {
  add: (entry: Omit<BotLogEntry, "id">) => void;
  entries: BotLogEntry[];
};

// Лента событий демо-панели: что сделали боты. Только в памяти вкладки —
// это подсказка ведущему демо, а не данные.
export const useBotLog = create<BotLogState>()((set) => ({
  entries: [],
  add: (entry) =>
    set((state) => ({
      entries: [{ ...entry, id: nextId++ }, ...state.entries].slice(0, LIMIT),
    })),
}));

// Действия ботов не показываются владельцу тостами (TASKS T12) — их видно
// только здесь. Подписка — исключение из правила «компоненты на шину не
// подписываются», как оверлей «Совпадение».
export const useBotLogFeed = () => {
  useEffect(
    () =>
      getRealtime().subscribe((event) => {
        if (event.type !== "bot:action") return;
        useBotLog.getState().add({
          at: event.at,
          botId: event.botId,
          text: event.text,
        });
      }),
    [],
  );
};
