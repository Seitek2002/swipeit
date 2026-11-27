import type { Db } from "./db";

// Порог отправки (TECH_SPEC §6 «Порог отправки», решение владельца от
// 27.11.2026): вишлист можно отправить, когда в «Хочу» впервые набралось
// 5 желаний — «Хочу» и «Очень хочу» из своей ленты и свои желания поровну.
export const SHARE_UNLOCK_WISHES = 5;

// Желания в «Хочу» (status "active"): по ним лента над колодой и «Ещё N
// желаний — и можно отправить». До открытия «Мимо», удаление и «Подарили»
// честно уменьшают счёт.
export const countActiveWishes = (db: Db, userId: string): number =>
  (db.wishlistItems[userId] ?? []).filter((item) => item.status === "active")
    .length;

// Одна проверка для всех, кто добавляет желание в «Хочу»: порог пройден
// впервые — ставим shareUnlockedAt и говорим клиенту (бант или тост).
// Однажды открывшись, отправка больше не закрывается.
export const checkShareUnlock = (
  db: Db,
  userId: string,
  at: string,
): boolean => {
  const meta = (db.wishlistMeta[userId] ??= {
    ownerId: userId,
    hideReservationCount: false,
  });
  if (meta.shareUnlockedAt) return false;
  if (countActiveWishes(db, userId) < SHARE_UNLOCK_WISHES) return false;
  meta.shareUnlockedAt = at;
  return true;
};
