import type { User } from "@swipeit/core/api/users/types";
import {
  SwipeContextInputSchema,
  SwipeInputSchema,
  type SwipeResponse,
} from "@swipeit/core/api/wishlist/types";
import { notFound } from "@swipeit/core/errors";
import { contextKey } from "@swipeit/core/logic/feed";
import {
  computeTaste,
  inferInterests,
  isTasteJustFormed,
  tasteOf,
} from "@swipeit/core/logic/taste";
import type { RealtimeScope } from "@swipeit/core/realtime/types";
import { parseInput } from "@swipeit/core/parse-input";
import { and, count, desc, eq, isNull, sql } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { ServerContext, ServerHandler, Tx } from "../../context";
import { productSwipes, users, wishlistItems } from "../../db/schema";
import { lockMe, rowToUser } from "../users/queries";
import {
  checkShareUnlock,
  countActiveWishes,
  nextOrderFor,
} from "../wishlist/queries";
import { swipesOf } from "./queries";
import { resolveList } from "../wishlists/queries";
import { checkSantaMemberWishlist, hasStep, reachStep } from "../funnel/steps";

// Свайпы своей ленты и ленты по ссылке-фильтру (BACKEND.md B06) — логика
// мока (handlers/swipes.ts). Все записи — под блокировкой своего профиля
// (§2.6): свайпы одного человека идут по очереди, вкус и порог считаются
// без гонок.

const isLike = (decision: string) =>
  decision === "like" || decision === "superlike";

const publish = (ctx: ServerContext, scope: RealtimeScope[]) =>
  // Своё — себе на других устройствах (§5).
  ctx.events.publish({ type: "db:changed", scope, id: ctx.userId ?? "" }, [
    ctx.userId ?? "",
  ]);

// Вкус — функция от истории свайпов: после любого изменения своей ленты
// пересчитываем его целиком. Так «Вернуть» возвращает вкус точно в прежнее
// состояние. Возвращает новый профиль и поменялись ли выведенные интересы.
const refreshTaste = async (
  ctx: ServerContext,
  user: User,
): Promise<{ interestsChanged: boolean; user: User }> => {
  const { productsById } = ctx.catalog;
  const swipes = await swipesOf(ctx.tx, user.id);
  const before = inferInterests(tasteOf(user, swipes, productsById), user);
  const taste = computeTaste(swipes, productsById);
  await ctx.tx.update(users).set({ taste }).where(eq(users.id, user.id));
  const next: User = { ...user };
  if (taste) next.taste = taste;
  else delete next.taste;
  return {
    user: next,
    interestsChanged: before.join() !== inferInterests(taste, next).join(),
  };
};

// Активное желание этого товара: «Мимо» и «Вернуть» убирают его.
const activeProductItem = (ownerId: string, productId: string) =>
  and(
    eq(wishlistItems.ownerId, ownerId),
    eq(wishlistItems.sourceKind, "product"),
    eq(wishlistItems.productId, productId),
    eq(wishlistItems.status, "active"),
    isNull(wishlistItems.deletedAt),
  );

const removeActiveItem = async (tx: Tx, ownerId: string, productId: string) =>
  (
    await tx
      .delete(wishlistItems)
      .where(activeProductItem(ownerId, productId))
      .returning({ id: wishlistItems.id })
  ).length > 0;

// «Хочу» и «Очень хочу» в своей ленте — желание в вишлисте. Уже есть —
// обновить приоритет и вариант; нет — в начало вишлиста wishlistId
// (главного, spec-multi-wishlists §2.3).
const upsertWish = async (
  tx: Tx,
  ownerId: string,
  wishlistId: string,
  productId: string,
  priority: "normal" | "top",
  variantChoice: Record<string, string> | undefined,
  at: Date,
): Promise<string> => {
  const [existing] = await tx
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(activeProductItem(ownerId, productId))
    .limit(1);
  if (existing) {
    await tx
      .update(wishlistItems)
      .set({ priority, ...(variantChoice ? { variantChoice } : {}) })
      .where(eq(wishlistItems.id, existing.id));
    return existing.id;
  }
  const id = `wi_${nanoid(10)}`;
  await tx.insert(wishlistItems).values({
    id,
    ownerId,
    sourceKind: "product",
    productId,
    priority,
    sortOrder: nextOrderFor(ownerId),
    variantChoice: variantChoice ?? null,
    wishlistId,
    addedAt: at,
  });
  return id;
};

// POST /swipes — решение по карточке. На 5-м желании в «Хочу» открывается
// отправка, ответ говорит клиенту запустить бант.
export const createSwipe: ServerHandler = async (ctx, { body }) => {
  const input = parseInput(SwipeInputSchema, body);
  if (!ctx.catalog.productsById.has(input.productId)) {
    throw notFound("Товар не найден");
  }
  const row = await lockMe(ctx);
  let user = rowToUser(row);
  const at = new Date(ctx.clock.now());
  const self = input.context.kind === "self";
  const variantChoice = input.variantChoice ?? null;

  // Первый свайп человека; пришёл по ссылке на чужой вишлист — ещё и
  // «гость начал свайпать» (P09).
  if (await reachStep(ctx.tx, user.id, "first_swipe", at.getTime())) {
    if (await hasStep(ctx.tx, user.id, "guest_opened")) {
      await reachStep(ctx.tx, user.id, "guest_first_swipe", at.getTime());
    }
    // «Первый свайп за 10 секунд» (PRD §4, п. 4; Q03). Профиль при брони
    // свайпает позже по другой причине — не в счёт. Неизвестное via (клиент
    // ещё не шлёт его — B15) — считаем как ленту.
    const fromFeed =
      row.createdVia === null ||
      row.createdVia === "feed" ||
      row.createdVia === "wishlist_link";
    if (fromFeed) {
      // Знаменатель «за 10 секунд» — ровно те, кому шаг положен (M07).
      await reachStep(ctx.tx, user.id, "first_swipe_feed", at.getTime());
      if (at.getTime() - row.createdAt.getTime() <= 10_000) {
        await reachStep(ctx.tx, user.id, "first_swipe_10s", at.getTime());
      }
    }
  }

  // Повторный свайп той же карточки в том же контексте заменяет прошлый и
  // становится последним (новый seq).
  await ctx.tx
    .insert(productSwipes)
    .values({
      id: `sw_${nanoid(10)}`,
      userId: user.id,
      productId: input.productId,
      decision: input.decision,
      contextKey: contextKey(input.context),
      pickRequestId:
        input.context.kind === "pick" ? input.context.requestId : null,
      variantChoice,
      at,
    })
    .onConflictDoUpdate({
      target: [
        productSwipes.userId,
        productSwipes.contextKey,
        productSwipes.productId,
      ],
      set: {
        id: `sw_${nanoid(10)}`,
        decision: input.decision,
        variantChoice,
        at,
        seq: sql`nextval(pg_get_serial_sequence('product_swipes', 'seq'))`,
      },
    });

  // «Свайпают дольше минуты» (PRD §7.4; Q03): 20 карточек в своей ленте.
  if (self && !(await hasStep(ctx.tx, user.id, "swipes_20"))) {
    const [{ value } = { value: 0 }] = await ctx.tx
      .select({ value: count() })
      .from(productSwipes)
      .where(
        and(
          eq(productSwipes.userId, user.id),
          eq(productSwipes.contextKey, "self"),
        ),
      );
    if (value >= 20) {
      await reachStep(ctx.tx, user.id, "swipes_20", at.getTime());
    }
  }

  // Передумал: «Мимо» после «Хочу» убирает товар из вишлиста.
  const passRemovedItem =
    self && !isLike(input.decision)
      ? await removeActiveItem(ctx.tx, user.id, input.productId)
      : false;
  const wishlistItemId =
    self && isLike(input.decision)
      ? await upsertWish(
          ctx.tx,
          user.id,
          (await resolveList(ctx.tx, row)).id,
          input.productId,
          input.decision === "superlike" ? "top" : "normal",
          input.variantChoice,
          at,
        )
      : undefined;

  const share = await checkShareUnlock(ctx.tx, user.id, at);
  if (wishlistItemId) {
    await checkSantaMemberWishlist(ctx.tx, user.id, at.getTime());
  }
  const wishCount = await countActiveWishes(ctx.tx, user.id);
  // Вкус — только по своей ленте: выбор по чужой ссылке-фильтру его не
  // трогает.
  let interestsChanged = false;
  let tasteJustFormed = false;
  if (self) {
    ({ user, interestsChanged } = await refreshTaste(ctx, user));
    tasteJustFormed = isTasteJustFormed(
      user.taste,
      user,
      share.shareJustUnlocked,
    );
  }

  publish(ctx, [
    "swipes",
    ...(wishlistItemId || passRemovedItem ? (["wishlist"] as const) : []),
    ...(interestsChanged ? (["users"] as const) : []),
  ]);
  const response: SwipeResponse = {
    wishCount,
    shareUnlocked: share.shareUnlocked,
    shareJustUnlocked: share.shareJustUnlocked,
    tasteJustFormed,
    ...(wishlistItemId ? { wishlistItemId } : {}),
  };
  return response;
};

// POST /swipes/undo — отменить последний свайп в контексте; если он положил
// товар в вишлист — убрать его оттуда. Открытая отправка не закрывается.
export const undoSwipe: ServerHandler = async (ctx, { body }) => {
  const { context } = parseInput(SwipeContextInputSchema, body);
  const user = rowToUser(await lockMe(ctx));
  const [last] = await ctx.tx
    .select()
    .from(productSwipes)
    .where(
      and(
        eq(productSwipes.userId, user.id),
        eq(productSwipes.contextKey, contextKey(context)),
      ),
    )
    .orderBy(desc(productSwipes.seq))
    .limit(1);
  if (!last) throw notFound("Нечего вернуть");
  await ctx.tx.delete(productSwipes).where(eq(productSwipes.id, last.id));

  const self = context.kind === "self";
  const wishlistChanged = self && isLike(last.decision);
  if (wishlistChanged) await removeActiveItem(ctx.tx, user.id, last.productId);
  const interestsChanged = self
    ? (await refreshTaste(ctx, user)).interestsChanged
    : false;

  publish(ctx, [
    "swipes",
    ...(wishlistChanged ? (["wishlist"] as const) : []),
    ...(interestsChanged ? (["users"] as const) : []),
  ]);
  return {
    productId: last.productId,
    wishCount: await countActiveWishes(ctx.tx, user.id),
  };
};

// POST /swipes/restart — «Начать заново» в конце колоды: пропущенные
// карточки вернутся, лайки остаются.
export const restartSwipes: ServerHandler = async (ctx, { body }) => {
  const { context } = parseInput(SwipeContextInputSchema, body);
  const user = rowToUser(await lockMe(ctx));
  const removed = await ctx.tx
    .delete(productSwipes)
    .where(
      and(
        eq(productSwipes.userId, user.id),
        eq(productSwipes.contextKey, contextKey(context)),
        eq(productSwipes.decision, "pass"),
      ),
    )
    .returning({ id: productSwipes.id });
  // Убрали «Мимо» — и вкус теперь без них.
  const interestsChanged =
    context.kind === "self"
      ? (await refreshTaste(ctx, user)).interestsChanged
      : false;
  publish(ctx, interestsChanged ? ["swipes", "users"] : ["swipes"]);
  return { removed: removed.length };
};
