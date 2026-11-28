import type {
  Occasion,
  Wishlist,
  WishlistMeta,
} from "@swipeit/core/api/wishlist/types";
import {
  DEFAULT_WISHLIST_NAME,
  resolveWishlist,
} from "@swipeit/core/logic/wishlists";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { Tx } from "../../context";
import { wishlistItems, wishlistMeta, wishlists } from "../../db/schema";

// Вишлисты человека на сервере (spec-multi-wishlists §2, §3.3): чтение,
// «Общий», главный. Нижний слой: только схема и core — его берут свой
// вишлист, свайпы, гостевой вид, Санта и превью ссылок.

export type WishlistRow = typeof wishlists.$inferSelect;
export type MetaRow = typeof wishlistMeta.$inferSelect;

export const newWishlistId = () => `wl_${nanoid(10)}`;

// Строка базы → Wishlist мока (§4.1: формы ответов те же).
export const rowToWishlist = (row: WishlistRow): Wishlist => ({
  id: row.id,
  ownerId: row.ownerId,
  name: row.name,
  isDefault: row.isDefault,
  ...(row.occasion ? { occasion: row.occasion as Occasion } : {}),
  ...(row.message ? { message: row.message } : {}),
  ...(row.dismissedGivenHintFor
    ? { dismissedGivenHintFor: row.dismissedGivenHintFor }
    : {}),
  createdAt: row.createdAt.toISOString(),
});

// Вишлисты владельца в порядке ряда: «Общий» первым, дальше по созданию.
export const listsOf = (tx: Tx, ownerId: string) =>
  tx
    .select()
    .from(wishlists)
    .where(eq(wishlists.ownerId, ownerId))
    .orderBy(desc(wishlists.isDefault), asc(wishlists.seq));

// «Общий» нового профиля — в той же транзакции, что и сам профиль
// (POST /users, вход Telegram с новым профилем).
export const createDefaultList = async (
  tx: Tx,
  ownerId: string,
  createdAt: Date,
): Promise<void> => {
  await tx.insert(wishlists).values({
    id: newWishlistId(),
    ownerId,
    name: DEFAULT_WISHLIST_NAME,
    isDefault: true,
    createdAt,
  });
};

// «Общий» владельца; нет — создать (страховка ensureDefaultList, §3.3:
// профиль, записанный в обход POST /users). Повод и сообщение — из
// wishlist_meta, как в миграции 0015. Две одновременные страховки дадут
// один «Общий»: уникальный индекс wishlists_owner_default.
export const ensureDefaultList = async (
  tx: Tx,
  ownerId: string,
): Promise<WishlistRow> => {
  const find = async () =>
    (
      await tx
        .select()
        .from(wishlists)
        .where(
          and(eq(wishlists.ownerId, ownerId), eq(wishlists.isDefault, true)),
        )
        .limit(1)
    )[0];
  const existing = await find();
  if (existing) return existing;
  await tx.execute(sql`
    insert into wishlists
      (id, owner_id, name, is_default, occasion, message, dismissed_given_hint_for)
    select ${newWishlistId()}, ${ownerId}, ${DEFAULT_WISHLIST_NAME}, true,
      m.occasion, m.message, m.dismissed_given_hint_for
    from (select 1) as one
    left join wishlist_meta m on m.owner_id = ${ownerId}
    on conflict do nothing
  `);
  const created = await find();
  if (!created) throw new Error("«Общий» не записался");
  return created;
};

// Все вишлисты владельца, «Общий» — точно есть.
export const ownListsOf = async (
  tx: Tx,
  ownerId: string,
): Promise<WishlistRow[]> => {
  const rows = await listsOf(tx, ownerId);
  if (rows.some((row) => row.isDefault)) return rows;
  await ensureDefaultList(tx, ownerId);
  return listsOf(tx, ownerId);
};

export const defaultOf = (rows: readonly WishlistRow[]): WishlistRow => {
  const found = rows.find((row) => row.isDefault);
  if (!found) throw new Error("Нет «Общего»");
  return found;
};

type Owner = { activeWishlistId: null | string; id: string };

// Вишлист запроса: явный — только свой (чужой — NOT_FOUND «Вишлист не
// найден»), без id — главный (§2.3).
export const resolveList = async (
  tx: Tx,
  owner: Owner,
  id?: string,
): Promise<WishlistRow> =>
  resolveWishlist(
    await ownListsOf(tx, owner.id),
    id,
    owner.activeWishlistId ?? undefined,
  );

// Строки этого вишлиста. Строка без wishlist_id (записана в обход кода
// после 0015) — в «Общем», как listIdOf мока.
export const inList = (list: Pick<WishlistRow, "id" | "isDefault">) =>
  list.isDefault
    ? or(
        eq(wishlistItems.wishlistId, list.id),
        isNull(wishlistItems.wishlistId),
      )
    : eq(wishlistItems.wishlistId, list.id);

export const readMeta = async (tx: Tx, ownerId: string) => {
  const [row] = await tx
    .select()
    .from(wishlistMeta)
    .where(eq(wishlistMeta.ownerId, ownerId))
    .limit(1);
  return row;
};

// WishlistMeta ответов (spec §3.1): повод, сообщение и скрытая подсказка —
// от вишлиста; порог отправки и «Не показывать мне даже это» — от человека.
export const listMetaOf = (
  ownerId: string,
  meta: MetaRow | undefined,
  list: WishlistRow,
): WishlistMeta => ({
  ownerId,
  ...(list.occasion ? { occasion: list.occasion as Occasion } : {}),
  ...(list.message ? { message: list.message } : {}),
  hideReservationCount: meta?.hideReservationCount ?? false,
  ...(meta?.shareUnlockedAt
    ? { shareUnlockedAt: meta.shareUnlockedAt.toISOString() }
    : {}),
  ...(list.dismissedGivenHintFor
    ? { dismissedGivenHintFor: list.dismissedGivenHintFor }
    : {}),
});

// Настройки вишлиста list (без него — «Общего»: так его видят гости,
// Санта и превью, пока они не знают про несколько вишлистов).
export const metaOf = async (
  tx: Tx,
  ownerId: string,
  list?: WishlistRow,
): Promise<WishlistMeta> =>
  listMetaOf(
    ownerId,
    await readMeta(tx, ownerId),
    list ?? (await ensureDefaultList(tx, ownerId)),
  );
