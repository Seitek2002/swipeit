import {
  CustomWishInputSchema,
  GivenInputSchema,
  MetaPatchInputSchema,
  PatchItemInputSchema,
  ReorderInputSchema,
  RestoreInputSchema,
  UNDELETE_WINDOW_MS,
  WishlistQueryInputSchema,
  WishlistTargetInputSchema,
} from "@swipeit/core/api/wishlist/inputs";
import type {
  WishlistItem,
  WishlistResponse,
} from "@swipeit/core/api/wishlist/types";
import { notFound, validation } from "@swipeit/core/errors";
import { normalizeOccasionFrom } from "@swipeit/core/logic/occasion";
import type { RealtimeScope } from "@swipeit/core/realtime/types";
import { parseInput } from "@swipeit/core/parse-input";
import { and, eq, gte, isNull, ne, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { ServerContext, ServerHandler, Tx } from "../../context";
import { datesOf } from "../dates/handlers";
import {
  reservations,
  uploads,
  wishlistItems,
  wishlistMeta,
  wishlists,
} from "../../db/schema";
import { areFriends } from "../friends/handlers";
import { lockMe, readMe, rowToUser } from "../users/queries";
import {
  checkShareUnlock,
  countActiveWishes,
  itemKeyOf,
  itemsOf,
  listItemsOf,
  nextOrderFor,
  ownerReservationInfo,
  readMeta,
  rowToItem,
} from "./queries";
import { listMetaOf, resolveList, rowToWishlist } from "../wishlists/queries";
import { checkSantaMemberWishlist, reachStep } from "../funnel/steps";

// Свой вишлист (BACKEND.md B07) — логика мока (handlers/wishlist.ts и
// повод из handlers/guest.ts). Каждая запись — под блокировкой строки users
// владельца (§2.6): правки, порядок и свайпы одного человека идут по очереди.

// Своё — себе; «Мне это подарили» и «Вернуть» — ещё и авторам броней на это
// желание (§5).
const changed = (
  ctx: ServerContext,
  scope: RealtimeScope[],
  reservers: readonly string[] = [],
) =>
  ctx.events.publish({ type: "db:changed", scope, id: ctx.userId ?? "" }, [
    ctx.userId ?? "",
    ...reservers,
  ]);

// Своё живое (не удалённое) желание; чужое — как несуществующее (§4.5).
const findItem = async (tx: Tx, ownerId: string, id: string | undefined) => {
  const [row] = await tx
    .select()
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.id, id ?? ""),
        eq(wishlistItems.ownerId, ownerId),
        isNull(wishlistItems.deletedAt),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Желание не найдено");
  return row;
};

// GET /wishlist?list — свой вишлист с мета-данными, счётчиком броней и
// подсказкой «Возможно, тебе подарили это». Без list — главный
// (spec-multi-wishlists §2.3); повод, сообщение и подсказка — его.
export const getMyWishlist: ServerHandler = async (ctx, { query }) => {
  const { list: listId } = parseInput(WishlistQueryInputSchema, query ?? {});
  const me = await readMe(ctx);
  const list = await resolveList(ctx.tx, me, listId);
  const items = await listItemsOf(ctx.tx, me.id, list);
  const meta = listMetaOf(me.id, await readMeta(ctx.tx, me.id), list);
  const response: WishlistResponse = {
    items,
    meta,
    wishlist: rowToWishlist(list),
    wishCount: await countActiveWishes(ctx.tx, me.id),
    ...(await ownerReservationInfo(
      ctx.tx,
      me.id,
      items,
      meta,
      ctx.clock.now(),
    )),
  };
  return response;
};

// POST /wishlist/items — своё желание. Фото — только свой загруженный файл.
// Вишлист — wishlistId из тела (открытый на экране), без него — главный.
export const createCustomWish: ServerHandler = async (ctx, { body }) => {
  const custom = parseInput(CustomWishInputSchema, body);
  const { wishlistId } = parseInput(WishlistTargetInputSchema, body);
  const me = await lockMe(ctx);
  const list = await resolveList(ctx.tx, me, wishlistId);
  if (custom.imageKey) {
    const [file] = await ctx.tx
      .select({ key: uploads.key })
      .from(uploads)
      .where(and(eq(uploads.key, custom.imageKey), eq(uploads.ownerId, me.id)))
      .limit(1);
    if (!file) throw validation("Фото не найдено — загрузи его ещё раз");
  }
  const at = new Date(ctx.clock.now());
  const [row] = await ctx.tx
    .insert(wishlistItems)
    .values({
      id: `wi_${nanoid(10)}`,
      ownerId: me.id,
      sourceKind: "custom",
      custom,
      sortOrder: nextOrderFor(me.id),
      wishlistId: list.id,
      addedAt: at,
    })
    .returning();
  if (!row) throw new Error("Желание не записалось");
  // Своё желание считается в порог отправки наравне с «Хочу» из ленты.
  const { shareJustUnlocked } = await checkShareUnlock(ctx.tx, me.id, at);
  await checkSantaMemberWishlist(ctx.tx, me.id, at.getTime());
  changed(ctx, ["wishlist"]);
  return {
    ...rowToItem(row),
    wishCount: await countActiveWishes(ctx.tx, me.id),
    shareJustUnlocked,
  };
};

// PATCH /wishlist/items/:id — вариант, заметка, «Очень хочу».
export const updateItem: ServerHandler = async (ctx, { params, body }) => {
  const patch = parseInput(PatchItemInputSchema, body);
  const me = await lockMe(ctx);
  const target = await findItem(ctx.tx, me.id, params.id);
  const [row] = await ctx.tx
    .update(wishlistItems)
    .set({
      ...(patch.priority ? { priority: patch.priority } : {}),
      ...(patch.variantChoice ? { variantChoice: patch.variantChoice } : {}),
      ...(patch.note !== undefined ? { note: patch.note.trim() || null } : {}),
    })
    .where(eq(wishlistItems.id, target.id))
    .returning();
  changed(ctx, ["wishlist"]);
  return rowToItem(row ?? target);
};

// DELETE /wishlist/items/:id — желание 10 минут лежит с deleted_at: так
// «Отменить» вернёт его без тела (§4.4). Ответ — желание целиком, как в моке.
export const deleteItem: ServerHandler = async (ctx, { params }) => {
  const me = await lockMe(ctx);
  const target = await findItem(ctx.tx, me.id, params.id);
  await ctx.tx
    .update(wishlistItems)
    .set({ deletedAt: new Date(ctx.clock.now()) })
    .where(eq(wishlistItems.id, target.id));
  changed(ctx, ["wishlist"]);
  return rowToItem(target);
};

// POST /wishlist/items/:id/undelete — «Отменить» удаление. Тело (желание
// целиком, его шлёт мок-клиент) сервер не читает: верить клиенту нельзя.
// Желание встаёт на прежнее место, вставшие на его номер позже — ниже.
export const undeleteItem: ServerHandler = async (ctx, { params }) => {
  const me = await lockMe(ctx);
  const [row] = await ctx.tx
    .select()
    .from(wishlistItems)
    .where(
      and(
        eq(wishlistItems.id, params.id ?? ""),
        eq(wishlistItems.ownerId, me.id),
      ),
    )
    .limit(1);
  if (!row) throw notFound("Желание не найдено");
  // Уже на месте — повтор ничего не меняет.
  if (!row.deletedAt) return rowToItem(row);
  if (row.deletedAt.getTime() < ctx.clock.now() - UNDELETE_WINDOW_MS) {
    throw notFound("Желание уже не вернуть");
  }
  // Пока оно лежало удалённым, тот же товар снова лайкнули: второе живое
  // желание того же товара не нужно — остаётся новое.
  if (row.productId && row.status === "active") {
    const [twin] = await ctx.tx
      .select()
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.ownerId, me.id),
          eq(wishlistItems.productId, row.productId),
          eq(wishlistItems.status, "active"),
          isNull(wishlistItems.deletedAt),
        ),
      )
      .limit(1);
    if (twin) {
      await ctx.tx.delete(wishlistItems).where(eq(wishlistItems.id, row.id));
      return rowToItem(twin);
    }
  }
  await ctx.tx
    .update(wishlistItems)
    .set({ sortOrder: sql`${wishlistItems.sortOrder} + 1` })
    .where(
      and(
        eq(wishlistItems.ownerId, me.id),
        isNull(wishlistItems.deletedAt),
        gte(wishlistItems.sortOrder, row.sortOrder),
      ),
    );
  const [restored] = await ctx.tx
    .update(wishlistItems)
    .set({ deletedAt: null })
    .where(eq(wishlistItems.id, row.id))
    .returning();
  await checkShareUnlock(ctx.tx, me.id, new Date(ctx.clock.now()));
  changed(ctx, ["wishlist"]);
  return rowToItem(restored ?? row);
};

// POST /wishlist/reorder { ids } — новый ручной порядок: ids — все желания в
// нужном порядке, не упомянутые встают в конец, сохраняя свой порядок
// (номера новых желаний бывают отрицательными — сравниваем парой ключей).
export const reorderItems: ServerHandler = async (ctx, { body }) => {
  const { ids } = parseInput(ReorderInputSchema, body);
  const me = await lockMe(ctx);
  const items = await itemsOf(ctx.tx, me.id);
  const position = new Map(ids.map((id, index) => [id, index]));
  const rank = (item: WishlistItem) => position.get(item.id) ?? ids.length;
  const ordered = [...items].sort(
    (a, b) => rank(a) - rank(b) || a.order - b.order,
  );
  for (const [index, item] of ordered.entries()) {
    if (item.order === index) continue;
    await ctx.tx
      .update(wishlistItems)
      .set({ sortOrder: index })
      .where(eq(wishlistItems.id, item.id));
  }
  changed(ctx, ["wishlist"]);
  return { ok: true };
};

// POST /wishlist/items/:id/given — «Мне это подарили»: желание уходит во
// вкладку «Подарили», брони на него закрываются. Отметить дарителя можно
// только друга (§4.4).
export const markGiven: ServerHandler = async (ctx, { params, body }) => {
  const input = parseInput(GivenInputSchema, body);
  const me = await lockMe(ctx);
  const target = await findItem(ctx.tx, me.id, params.id);
  if (
    input.fromUserId &&
    !(await areFriends(ctx.tx, me.id, input.fromUserId))
  ) {
    throw validation("Подарить мог только друг");
  }
  // Метка закрытия броней этим «подарили» — «Отменить» откроет ровно их
  // (ревью R6): иначе открылись бы и брони прошлого «подарили», и
  // уникальный индекс открытой брони уронил бы запрос в 500.
  const closedAt = new Date(ctx.clock.now());
  const given: NonNullable<WishlistItem["given"]> & { closedAt: string } = {
    ...(input.fromUserId ? { fromUserId: input.fromUserId } : {}),
    ...(input.fromName ? { fromName: input.fromName } : {}),
    at: input.at,
    closedAt: closedAt.toISOString(),
  };
  const [row] = await ctx.tx
    .update(wishlistItems)
    .set({ status: "given", given })
    .where(eq(wishlistItems.id, target.id))
    .returning();
  const closed = await ctx.tx
    .update(reservations)
    .set({ closedAt })
    .where(
      and(
        eq(reservations.ownerRef, me.id),
        eq(reservations.itemKey, itemKeyOf(rowToItem(target))),
        isNull(reservations.closedAt),
      ),
    )
    .returning({ id: reservations.id, reserverId: reservations.reserverId });
  // Исход вишлиста (Q02): подарили то, что бронировали.
  if (closed.length > 0) {
    await reachStep(ctx.tx, me.id, "gift_given_reserved", ctx.clock.now());
  }
  changed(
    ctx,
    ["wishlist", "reservations"],
    closed.map((entry) => entry.reserverId),
  );
  return rowToItem(row ?? target);
};

// POST /wishlist/items/:id/restore — вернуть из «Подарили» в начало списка,
// как новое желание; брони не восстанавливаются. { undo: true } — «Отменить» сразу после «Мне это
// подарили»: прежнее место, закрытые этим действием брони снова открыты.
export const restoreItem: ServerHandler = async (ctx, { params, body }) => {
  const { undo = false } = parseInput(RestoreInputSchema, body ?? {});
  const me = await lockMe(ctx);
  const target = await findItem(ctx.tx, me.id, params.id);
  if (target.status !== "given") return rowToItem(target);
  const now = ctx.clock.now();

  // Тот же товар, пока он был в «Подарили», лайкнули заново: живое желание
  // уже есть — подаренную копию просто убираем.
  if (target.productId) {
    const [twin] = await ctx.tx
      .select()
      .from(wishlistItems)
      .where(
        and(
          eq(wishlistItems.ownerId, me.id),
          eq(wishlistItems.productId, target.productId),
          eq(wishlistItems.status, "active"),
          isNull(wishlistItems.deletedAt),
          ne(wishlistItems.id, target.id),
        ),
      )
      .limit(1);
    if (twin) {
      await ctx.tx.delete(wishlistItems).where(eq(wishlistItems.id, target.id));
      changed(ctx, ["wishlist"]);
      return rowToItem(twin);
    }
  }

  const closedByGiven = (target.given as null | { closedAt?: string })
    ?.closedAt;
  if (
    undo &&
    closedByGiven &&
    Date.parse(closedByGiven) >= now - UNDELETE_WINDOW_MS
  ) {
    await ctx.tx
      .update(reservations)
      .set({ closedAt: null })
      .where(
        and(
          eq(reservations.ownerRef, me.id),
          eq(reservations.itemKey, itemKeyOf(rowToItem(target))),
          eq(reservations.closedAt, new Date(closedByGiven)),
        ),
      );
  }
  const [row] = await ctx.tx
    .update(wishlistItems)
    .set({
      status: "active",
      given: null,
      ...(undo ? {} : { sortOrder: nextOrderFor(me.id) }),
    })
    .where(eq(wishlistItems.id, target.id))
    .returning();
  await checkShareUnlock(ctx.tx, me.id, new Date(now));
  changed(ctx, ["wishlist", "reservations"]);
  return rowToItem(row ?? target);
};

// PATCH /wishlist/meta — повод, сообщение, «Не показывать мне даже это».
// Повод дополняет сервер: дату и готовый повод — по своим датам и профилю.
// Повод и сообщение — вишлиста wishlistId (без него — главного),
// «Не показывать мне даже это» — человека (spec §2.1).
export const updateMeta: ServerHandler = async (ctx, { body }) => {
  const patch = parseInput(MetaPatchInputSchema, body);
  const row = await lockMe(ctx);
  const me = rowToUser(row);
  const list = await resolveList(ctx.tx, row, patch.wishlistId);
  const current = listMetaOf(me.id, await readMeta(ctx.tx, me.id), list);
  const next = { ...current };
  if (patch.occasion === null) delete next.occasion;
  else if (patch.occasion) {
    const dates = await datesOf(ctx.tx, me.id);
    next.occasion = normalizeOccasionFrom(
      { birthday: me.birthday, dates },
      patch.occasion,
      ctx.clock.now(),
    );
  }
  if (patch.message !== undefined) {
    const message = patch.message.trim();
    if (message) next.message = message;
    else delete next.message;
  }
  if (patch.hideReservationCount !== undefined) {
    next.hideReservationCount = patch.hideReservationCount;
  }
  await ctx.tx
    .update(wishlists)
    .set({ occasion: next.occasion ?? null, message: next.message ?? null })
    .where(eq(wishlists.id, list.id));
  const values = { hideReservationCount: next.hideReservationCount };
  await ctx.tx
    .insert(wishlistMeta)
    .values({ ownerId: me.id, ...values })
    .onConflictDoUpdate({ target: wishlistMeta.ownerId, set: values });
  changed(ctx, ["wishlist"]);
  return next;
};

// POST /wishlist/given-hint/dismiss { wishlistId? } — «Скрыть» подсказку
// «Возможно, тебе подарили это» для текущего повода этого вишлиста (без
// wishlistId — главного).
export const dismissGivenHint: ServerHandler = async (ctx, { body }) => {
  const { wishlistId } = parseInput(WishlistTargetInputSchema, body ?? {});
  const me = await lockMe(ctx);
  const list = await resolveList(ctx.tx, me, wishlistId);
  const date = rowToWishlist(list).occasion?.date;
  if (date) {
    await ctx.tx
      .update(wishlists)
      .set({ dismissedGivenHintFor: date })
      .where(eq(wishlists.id, list.id));
  }
  changed(ctx, ["wishlist"]);
  return { ok: true };
};
