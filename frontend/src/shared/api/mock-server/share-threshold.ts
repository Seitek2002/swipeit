// Порог отправки в моке: обёртка над Db вокруг правила @swipeit/core
// (BACKEND.md B02).
import {
  SHARE_UNLOCK_WISHES,
  countActiveWishItems,
  shouldUnlockShare,
} from "@swipeit/core/logic/share-threshold";

import type { Db } from "./db";

export { SHARE_UNLOCK_WISHES };

export const countActiveWishes = (db: Db, userId: string): number =>
  countActiveWishItems(db.wishlistItems[userId] ?? []);

// Одна проверка для всех, кто добавляет желание в «Хочу»: порог пройден
// впервые — ставим shareUnlockedAt и говорим клиенту (бант или тост).
export const checkShareUnlock = (
  db: Db,
  userId: string,
  at: string,
): boolean => {
  const meta = (db.wishlistMeta[userId] ??= {
    ownerId: userId,
    hideReservationCount: false,
  });
  if (!shouldUnlockShare(countActiveWishes(db, userId), meta.shareUnlockedAt))
    return false;
  meta.shareUnlockedAt = at;
  return true;
};
