import {
  DEFAULT_WISHLIST_NAME,
  defaultWishlistOf,
  itemsInList,
  resolveWishlist,
} from "@swipeit/core/logic/wishlists";

import type { Wishlist, WishlistItem, WishlistMeta } from "../wishlist/types";
import type { Db } from "./db";

// Вишлисты человека в моке (spec-multi-wishlists §3.6) — как
// backend/src/domains/wishlists/queries.ts. Чтение (GET) базу не пишет,
// поэтому у «Общего» id от id владельца: «Общий», который ещё не записан, и
// записанный нормализацией — один и тот же.

export const defaultWishlistIdOf = (ownerId: string) =>
  `wl_main_${ownerId.replace(/^u_/, "")}`;

// «Общий» человека без вишлистов: повод, сообщение и скрытая подсказка —
// из wishlistMeta (старые данные), как в миграции 0015 сервера.
const defaultListFor = (db: Db, ownerId: string): Wishlist => {
  const meta = db.wishlistMeta[ownerId];
  const list: Wishlist = {
    id: defaultWishlistIdOf(ownerId),
    ownerId,
    name: DEFAULT_WISHLIST_NAME,
    isDefault: true,
    createdAt: db.users[ownerId]?.createdAt ?? new Date(0).toISOString(),
  };
  if (meta?.occasion) list.occasion = structuredClone(meta.occasion);
  if (meta?.message) list.message = meta.message;
  if (meta?.dismissedGivenHintFor) {
    list.dismissedGivenHintFor = meta.dismissedGivenHintFor;
  }
  return list;
};

// Вишлисты владельца для чтения: «Общий» есть всегда (не записан — такой,
// каким его запишет ensureLists).
export const listsOf = (db: Db, ownerId: string): Wishlist[] => {
  const stored = db.wishlists[ownerId] ?? [];
  return defaultWishlistOf(stored)
    ? stored
    : [defaultListFor(db, ownerId), ...stored];
};

// Вишлисты владельца для записи: «Общий» записан в базу.
export const ensureLists = (db: Db, ownerId: string): Wishlist[] => {
  const stored = (db.wishlists[ownerId] ??= []);
  if (!defaultWishlistOf(stored)) stored.unshift(defaultListFor(db, ownerId));
  return stored;
};

export const defaultListOf = (lists: readonly Wishlist[]): Wishlist => {
  const found = defaultWishlistOf(lists);
  if (!found) throw new Error("Нет «Общего»");
  return found;
};

// Вишлист запроса: явный — только свой (чужой — NOT_FOUND «Вишлист не
// найден»), без id — главный (§2.3).
export const resolveListOf = (
  db: Db,
  lists: readonly Wishlist[],
  ownerId: string,
  id?: string,
): Wishlist => resolveWishlist(lists, id, db.activeWishlist[ownerId]);

// Строки вишлиста list из строк владельца. У старых данных wishlistId нет,
// а у строки, перенесённой в обход обработчиков, он может быть чужим, —
// такая строка в «Общем».
export const itemsOfList = (
  items: readonly WishlistItem[],
  lists: readonly Wishlist[],
  list: Pick<Wishlist, "id">,
): WishlistItem[] => {
  const fallback = defaultListOf(lists).id;
  const known = new Set(lists.map((entry) => entry.id));
  return itemsInList(
    items.map((item) =>
      item.wishlistId && !known.has(item.wishlistId)
        ? { ...item, wishlistId: fallback }
        : item,
    ),
    list.id,
    fallback,
  );
};

export const listItemsOf = (
  db: Db,
  lists: readonly Wishlist[],
  ownerId: string,
  list: Pick<Wishlist, "id">,
): WishlistItem[] => itemsOfList(db.wishlistItems[ownerId] ?? [], lists, list);

// WishlistMeta ответов (spec §3.1): повод, сообщение и скрытая подсказка —
// от вишлиста; порог отправки и «Не показывать мне даже это» — от человека.
export const listMetaOf = (
  db: Db,
  ownerId: string,
  list: Wishlist,
): WishlistMeta => {
  const person = db.wishlistMeta[ownerId];
  const meta: WishlistMeta = {
    ownerId,
    hideReservationCount: person?.hideReservationCount ?? false,
  };
  if (list.occasion) meta.occasion = list.occasion;
  if (list.message) meta.message = list.message;
  if (person?.shareUnlockedAt) meta.shareUnlockedAt = person.shareUnlockedAt;
  if (list.dismissedGivenHintFor) {
    meta.dismissedGivenHintFor = list.dismissedGivenHintFor;
  }
  return meta;
};

// «Общий» владельца — так его видят гости, Санта и боты, пока они не знают
// про несколько вишлистов (L06, L07).
export const defaultListFrom = (db: Db, ownerId: string): Wishlist =>
  defaultListOf(listsOf(db, ownerId));

// Нормализация при чтении базы (§3.6, TECH_SPEC §5 «Совместимость»): база,
// сохранённая до нескольких вишлистов, не сбрасывается. У каждого профиля —
// «Общий» с поводом и сообщением из wishlistMeta, желания без wishlistId —
// в нём. version остаётся 1.
export const normalizeWishlists = (db: Db): Db => {
  for (const ownerId of Object.keys(db.users)) {
    const fallback = defaultListOf(ensureLists(db, ownerId)).id;
    for (const item of db.wishlistItems[ownerId] ?? []) {
      item.wishlistId ??= fallback;
    }
  }
  return db;
};
