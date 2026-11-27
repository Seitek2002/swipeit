import { shouldUnlockShare } from "@swipeit/core/logic/share-threshold";
import { and, count, eq, isNull } from "drizzle-orm";

import type { Tx } from "../../context";
import { wishlistItems, wishlistMeta } from "../../db/schema";

// Вишлист на сервере: то, что нужно свайпам уже сейчас (B06). Маршруты
// вишлиста — B07.

// Желания в «Хочу»: активные и не удалённые (удалённое 10 минут ждёт
// «Вернуть» с deleted_at).
export const countActiveWishes = async (tx: Tx, ownerId: string) => {
  const [row] = await tx
    .select({ value: count() })
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.ownerId, ownerId),
        eq(wishlistItems.status, "active"),
        isNull(wishlistItems.deletedAt),
      ),
    );
  return row?.value ?? 0;
};

// Порог отправки — правило из core (как checkShareUnlock мока): пройден
// впервые — ставим share_unlocked_at и говорим клиенту (бант или тост).
// Однажды открывшись, отправка не закрывается.
export const checkShareUnlock = async (
  tx: Tx,
  ownerId: string,
  at: Date,
): Promise<{ shareJustUnlocked: boolean; shareUnlocked: boolean }> => {
  const [meta] = await tx
    .select({ shareUnlockedAt: wishlistMeta.shareUnlockedAt })
    .from(wishlistMeta)
    .where(eq(wishlistMeta.ownerId, ownerId))
    .for("update")
    .limit(1);
  const unlockedAt = meta?.shareUnlockedAt?.toISOString();
  if (!shouldUnlockShare(await countActiveWishes(tx, ownerId), unlockedAt)) {
    return { shareJustUnlocked: false, shareUnlocked: Boolean(unlockedAt) };
  }
  await tx
    .insert(wishlistMeta)
    .values({ ownerId, shareUnlockedAt: at })
    .onConflictDoUpdate({
      target: wishlistMeta.ownerId,
      set: { shareUnlockedAt: at },
    });
  return { shareJustUnlocked: true, shareUnlocked: true };
};
