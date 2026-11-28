"use client";

import { useAppMode } from "@/shared/lib/app-status";
import {
  getActiveUserId,
  useSessionStore,
  useWishlistSentStore,
} from "@/shared/store";

import { type SentReminder, sentReminder, wishlistSignature } from "./model";

type Items = ReadonlyArray<{ id: string; status: "active" | "given" }>;

// Ссылку собрали («Поделиться», «Скопировать», QR) — запоминаем, что было в
// вишлисте (G06).
export const rememberSent = (items: Items) => {
  const userId = getActiveUserId();
  if (userId) {
    useWishlistSentStore.getState().remember(userId, wishlistSignature(items));
  }
};

// Как показать напоминание о своей дате на «Моём вишлисте» (G06). Пока
// вишлист не пришёл — как раньше.
export const useSentReminder = (items: Items | undefined): SentReminder => {
  const userId = useSessionStore((state) => state.activeUserId);
  const sent = useWishlistSentStore((state) =>
    userId ? state.byUser[userId] : undefined,
  );
  const mode = useAppMode();
  if (!items) return "default";
  return sentReminder({
    current: wishlistSignature(items),
    sent,
    snapshotLinks: mode !== "remote",
  });
};
