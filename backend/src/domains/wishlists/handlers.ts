import {
  CreateWishlistInputSchema,
  PatchWishlistInputSchema,
} from "@swipeit/core/api/wishlist/inputs";
import type {
  DeleteWishlistResponse,
  WishlistItem,
  WishlistsResponse,
  WishlistSummary,
} from "@swipeit/core/api/wishlist/types";
import { validation } from "@swipeit/core/errors";
import { normalizeOccasionFrom } from "@swipeit/core/logic/occasion";
import {
  assertCanCreateWishlist,
  assertCanDeleteWishlist,
  assertCanRenameWishlist,
  findOwnWishlist,
  listIdOf,
  mergeOnMove,
  ordersOnTop,
  planListDeletion,
  resolveActiveWishlistId,
  WISHLIST_ERRORS,
  wishlistCounts,
  wishlistCover,
} from "@swipeit/core/logic/wishlists";
import { parseInput } from "@swipeit/core/parse-input";
import { and, eq, isNotNull } from "drizzle-orm";

import type { ServerContext, ServerHandler, Tx } from "../../context";
import { users, wishlistItems, wishlists } from "../../db/schema";
import { datesOf } from "../dates/handlers";
import { liveWishlistLinksOf, revokeWishlistLinks } from "../share/links";
import { lockMe, readMe, rowToUser, type UserRow } from "../users/queries";
import { itemsOf, listItemsOf } from "../wishlist/queries";
import {
  defaultOf,
  newWishlistId,
  ownListsOf,
  rowToWishlist,
  type WishlistRow,
} from "./queries";

// Несколько вишлистов, как плейлисты (spec-multi-wishlists §2, §3.2, L04):
// ряд, создание, переименование, удаление, главный. Логика — та же, что у
// мока (handlers/wishlists.ts), правила — в core (logic/wishlists). Записи —
// под блокировкой своего профиля (§2.6), как всё своё.

// Своё — себе на других устройствах (§5).
const changed = (ctx: ServerContext) =>
  ctx.events.publish(
    { type: "db:changed", scope: ["wishlist"], id: ctx.userId ?? "" },
    [ctx.userId ?? ""],
  );

// Ошибка уникального индекса PostgreSQL (23505) — в том числе обёрнутая
// Drizzle: wishlists_owner_name — гонка или регистр, который lower() базы
// понял иначе, чем core.
const isUniqueViolation = (error: unknown): boolean => {
  const value = error as { cause?: unknown; code?: string };
  return (
    value?.code === "23505" ||
    (value?.cause ? isUniqueViolation(value.cause) : false)
  );
};

const withNameCheck = async <T>(write: () => Promise<T>): Promise<T> => {
  try {
    return await write();
  } catch (error) {
    if (isUniqueViolation(error)) throw validation(WISHLIST_ERRORS.nameTaken);
    throw error;
  }
};

// Ряд вишлистов (GET /wishlists): «Общий» первым, дальше по созданию;
// счётчики и обложка — по строкам каждого вишлиста.
const wishlistsView = async (
  tx: Tx,
  me: Pick<UserRow, "activeWishlistId" | "id">,
): Promise<WishlistsResponse> => {
  const lists = await ownListsOf(tx, me.id);
  const fallback = defaultOf(lists).id;
  const items = await itemsOf(tx, me.id);
  const links = await liveWishlistLinksOf(tx, me.id);
  const summaries = lists.map((list): WishlistSummary => {
    const listItems = items.filter(
      (item) => listIdOf(item, fallback) === list.id,
    );
    // Ссылка «Общего» до 0015 — на id владельца (share/links.ts).
    const sharedAt =
      links.get(list.id) ?? (list.isDefault ? links.get(me.id) : undefined);
    const { occasion } = rowToWishlist(list);
    return {
      id: list.id,
      name: list.name,
      isDefault: list.isDefault,
      ...(occasion ? { occasion } : {}),
      ...wishlistCounts(listItems),
      cover: wishlistCover(listItems),
      ...(sharedAt ? { sharedAt: sharedAt.toISOString() } : {}),
    };
  });
  return {
    activeId:
      resolveActiveWishlistId(lists, me.activeWishlistId ?? undefined) ??
      fallback,
    lists: summaries,
  };
};

// GET /wishlists — ряд своих вишлистов и главный.
export const getWishlists: ServerHandler = async (ctx) =>
  wishlistsView(ctx.tx, await readMe(ctx));

const setActive = async (tx: Tx, me: UserRow, listId: null | string) => {
  await tx
    .update(users)
    .set({ activeWishlistId: listId })
    .where(eq(users.id, me.id));
  return { ...me, activeWishlistId: listId };
};

// POST /wishlists { name, occasion?, makeActive? } — новый вишлист в конце
// ряда. С выключенным флагом — FORBIDDEN MULTI_WISHLISTS_OFF: у человека
// только «Общий». Лимит 10 и повтор названия без учёта регистра —
// VALIDATION.
export const createWishlist: ServerHandler = async (ctx, { body }) => {
  const input = parseInput(CreateWishlistInputSchema, body);
  const row = await lockMe(ctx);
  const lists = await ownListsOf(ctx.tx, row.id);
  assertCanCreateWishlist(lists, input.name, {
    enabled: Boolean(ctx.multiWishlists),
  });
  const now = ctx.clock.now();
  const me = rowToUser(row);
  const occasion = input.occasion
    ? normalizeOccasionFrom(
        { birthday: me.birthday, dates: await datesOf(ctx.tx, me.id) },
        input.occasion,
        now,
      )
    : null;
  const [created] = await withNameCheck(() =>
    ctx.tx
      .insert(wishlists)
      .values({
        id: newWishlistId(),
        ownerId: me.id,
        name: input.name,
        isDefault: false,
        occasion,
        createdAt: new Date(now),
      })
      .returning(),
  );
  if (!created) throw new Error("Вишлист не записался");
  if (input.makeActive) await setActive(ctx.tx, row, created.id);
  changed(ctx);
  return rowToWishlist(created);
};

// PATCH /wishlists/:id { name? } — переименовать («Общий» тоже можно:
// isDefault остаётся, §2.2).
export const patchWishlist: ServerHandler = async (ctx, { params, body }) => {
  const input = parseInput(PatchWishlistInputSchema, body ?? {});
  const me = await lockMe(ctx);
  const lists = await ownListsOf(ctx.tx, me.id);
  const list = findOwnWishlist(lists, params.id ?? "");
  if (input.name === undefined || input.name === list.name) {
    return rowToWishlist(list);
  }
  const name = input.name;
  assertCanRenameWishlist(lists, list.id, name);
  const [updated] = await withNameCheck(() =>
    ctx.tx
      .update(wishlists)
      .set({ name })
      .where(eq(wishlists.id, list.id))
      .returning(),
  );
  changed(ctx);
  return rowToWishlist(updated ?? list);
};

// Желания удалённого вишлиста — в «Общий» (§2.7, решение В2): и активные,
// и подаренные, наверх, в прежнем порядке; активный двойник в «Общем» —
// слияние (mergeOnMove), перемещаемая строка удаляется. Удалённые в окне
// «Отменить» тоже переезжают — иначе каскад унёс бы их вместе с вишлистом.
const moveIntoDefault = async (
  tx: Tx,
  ownerId: string,
  list: WishlistRow,
  fallback: WishlistRow,
): Promise<number> => {
  const deletedItems = await listItemsOf(tx, ownerId, list);
  const defaultItems = await listItemsOf(tx, ownerId, fallback);
  const { merges, moves } = planListDeletion(deletedItems, defaultItems);
  const byId = new Map<string, WishlistItem>(
    [...deletedItems, ...defaultItems].map((item) => [item.id, item]),
  );
  for (const { movingId, targetId } of merges) {
    const target = byId.get(targetId);
    const moving = byId.get(movingId);
    if (!target || !moving) continue;
    const merged = mergeOnMove(target, moving);
    await tx.delete(wishlistItems).where(eq(wishlistItems.id, movingId));
    await tx
      .update(wishlistItems)
      .set({
        priority: merged.priority,
        note: merged.note ?? null,
        variantChoice: merged.variantChoice ?? null,
      })
      .where(eq(wishlistItems.id, targetId));
  }
  const orders = ordersOnTop(
    defaultItems.map((item) => item.order),
    moves.length,
  );
  for (const [index, id] of moves.entries()) {
    await tx
      .update(wishlistItems)
      .set({ wishlistId: fallback.id, sortOrder: orders[index] ?? 0 })
      .where(eq(wishlistItems.id, id));
  }
  await tx
    .update(wishlistItems)
    .set({ wishlistId: fallback.id })
    .where(
      and(
        eq(wishlistItems.wishlistId, list.id),
        isNotNull(wishlistItems.deletedAt),
      ),
    );
  return merges.length + moves.length;
};

// DELETE /wishlists/:id — «Общий» не удаляется (FORBIDDEN). Желания — в
// «Общий», ссылка закрывается, был главным — главный «Общий», был выбран в
// Санте — игра видит «Общий» (внешний ключ set null). Одна транзакция.
export const deleteWishlist: ServerHandler = async (ctx, { params }) => {
  const me = await lockMe(ctx);
  const lists = await ownListsOf(ctx.tx, me.id);
  const list = findOwnWishlist(lists, params.id ?? "");
  assertCanDeleteWishlist(list);
  const fallback = defaultOf(lists);
  const movedCount = await moveIntoDefault(ctx.tx, me.id, list, fallback);
  await revokeWishlistLinks(ctx.tx, list.id, new Date(ctx.clock.now()));
  if (me.activeWishlistId === list.id) await setActive(ctx.tx, me, null);
  await ctx.tx
    .delete(wishlists)
    .where(and(eq(wishlists.id, list.id), eq(wishlists.ownerId, me.id)));
  changed(ctx);
  const response: DeleteWishlistResponse = { movedCount };
  return response;
};

// POST /wishlists/:id/activate — сделать главным: сюда летят «Хочу» из
// ленты, на всех устройствах человека (§2.3). Ответ — ряд с новым
// activeId.
export const activateWishlist: ServerHandler = async (ctx, { params }) => {
  const me = await lockMe(ctx);
  const lists = await ownListsOf(ctx.tx, me.id);
  const list = findOwnWishlist(lists, params.id ?? "");
  const next = await setActive(ctx.tx, me, list.id);
  changed(ctx);
  return wishlistsView(ctx.tx, next);
};
