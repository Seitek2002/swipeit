import { itemKeyOf } from "@swipeit/core/logic/wishlists";
import type {
  CustomWish,
  WishlistItem,
  WishlistMeta,
} from "@swipeit/core/api/wishlist/types";
import { toDateKey } from "@swipeit/core/format";
import { shouldUnlockShare } from "@swipeit/core/logic/share-threshold";
import { and, asc, count, eq, isNull, sql } from "drizzle-orm";

import type { Tx } from "../../context";
import { reservations, wishlistItems, wishlistMeta } from "../../db/schema";
import { reachStep } from "../funnel/steps";
import { inList, type WishlistRow } from "../wishlists/queries";

export { type MetaRow, readMeta } from "../wishlists/queries";

// Вишлист на сервере: чтение, порог отправки, счётчик броней — для свайпов
// (B06), своего вишлиста (B07) и гостевого (B08).

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
  await reachStep(tx, ownerId, "share_unlocked", at.getTime());
  return { shareJustUnlocked: true, shareUnlocked: true };
};

export type ItemRow = typeof wishlistItems.$inferSelect;

// «Подарили» без служебной метки закрытия броней (ревью R6).
const publicGiven = (given: unknown): WishlistItem["given"] => {
  const { closedAt: _closedAt, ...rest } = given as NonNullable<
    WishlistItem["given"]
  > & { closedAt?: string };
  return rest;
};

// Строка базы → WishlistItem мока (§4.1: формы ответов те же).
export const rowToItem = (row: ItemRow): WishlistItem => ({
  id: row.id,
  ownerId: row.ownerId,
  source:
    row.sourceKind === "product"
      ? { kind: "product", productId: row.productId ?? "" }
      : { kind: "custom", custom: row.custom as CustomWish },
  priority: row.priority as WishlistItem["priority"],
  order: row.sortOrder,
  ...(row.variantChoice
    ? { variantChoice: row.variantChoice as Record<string, string> }
    : {}),
  ...(row.note ? { note: row.note } : {}),
  status: row.status as WishlistItem["status"],
  ...(row.given ? { given: publicGiven(row.given) } : {}),
  ...(row.wishlistId ? { wishlistId: row.wishlistId } : {}),
  ...(row.originId ? { originId: row.originId } : {}),
  addedAt: row.addedAt.toISOString(),
});

// Желания владельца без удалённых, в его порядке.
export const itemsOf = async (tx: Tx, ownerId: string) =>
  (
    await tx
      .select()
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.ownerId, ownerId),
          isNull(wishlistItems.deletedAt),
        ),
      )
      .orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.addedAt))
  ).map(rowToItem);

// Желания одного вишлиста без удалённых, в его порядке (spec §2.4).
export const listItemsOf = async (
  tx: Tx,
  ownerId: string,
  list: Pick<WishlistRow, "id" | "isDefault">,
) =>
  (
    await tx
      .select()
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.ownerId, ownerId),
          inList(list),
          isNull(wishlistItems.deletedAt),
        ),
      )
      .orderBy(asc(wishlistItems.sortOrder), asc(wishlistItems.addedAt))
  ).map(rowToItem);

// Номер нового желания — «в начало списка» (просьба владельца: новые
// желания первыми): на единицу меньше самого верхнего, в пустом — 0. Номер
// может уйти в минус — порядок важен, а не сами числа. Подзапросом, внутри
// той же записи. Его же берут свайпы и «Вернуть» из «Подарили».
export const nextOrderFor = (ownerId: string) =>
  sql<number>`(select coalesce(min(sort_order), 1) - 1 from wishlist_items where owner_id = ${ownerId} and deleted_at is null)`;

// itemKey брони: productId или "custom:<id>" (как itemKeyOf мока).
// Общий с моком (core): у копии своего желания — ключ оригинала.
export { itemKeyOf };

// Счётчик броней и подсказка «Возможно, тебе подарили это» — для GET
// /wishlist владельца (как ownerReservationInfo мока). Кто бронировал — не
// читаем вовсе (§4.6, п. 1).
export const ownerReservationInfo = async (
  tx: Tx,
  ownerId: string,
  items: readonly WishlistItem[],
  meta: WishlistMeta,
  now: number,
) => {
  const active = items.filter((item) => item.status === "active");
  const activeKeys = new Set(active.map(itemKeyOf));
  const open = await tx
    .select({ itemKey: reservations.itemKey })
    .from(reservations)
    .where(
      and(eq(reservations.ownerRef, ownerId), isNull(reservations.closedAt)),
    );
  const reservedKeys = new Set(
    open.map((row) => row.itemKey).filter((key) => activeKeys.has(key)),
  );
  // Повод прошёл — брони больше не секрет: показываем, что, возможно, уже
  // подарили. До даты повода брони скрыты.
  const date = meta.occasion?.date;
  const passed = Boolean(date && date < toDateKey(now));
  const givenHintIds =
    passed && meta.dismissedGivenHintFor !== date
      ? active
          .filter((item) => reservedKeys.has(itemKeyOf(item)))
          .map((item) => item.id)
      : [];
  return {
    reservationCount: meta.hideReservationCount ? null : reservedKeys.size,
    givenHintIds,
  };
};
