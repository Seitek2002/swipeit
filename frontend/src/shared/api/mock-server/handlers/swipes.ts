import { nanoid } from "nanoid";
import { z } from "zod";

import type { SwipeResponse } from "../../wishlist/types";
import { SwipeContextSchema, SwipeDecisionSchema } from "../../wishlist/types";
import { type Handler, nowIso } from "../context";
import type { Db } from "../db";
import { notFound } from "../errors";
import { contextKey } from "../feed";
import { parseInput, requireUser } from "./common";

// Порог шеринга: после 5 «Хочу» вишлист можно отправить (решение владельца
// от 26.11.2026). Считаются лайки, а не свайпы вообще.
export const SHARE_UNLOCK_LIKES = 5;

const SwipeBodySchema = z.object({
  productId: z.string().min(1),
  decision: SwipeDecisionSchema,
  context: SwipeContextSchema,
  // Вариант из шторки «Подробнее» («мне — чёрный, M») — уходит в вишлист.
  variantChoice: z.record(z.string(), z.string()).optional(),
});

const ContextBodySchema = z.object({ context: SwipeContextSchema });

const isLike = (decision: string) =>
  decision === "like" || decision === "superlike";

export const countSelfLikes = (db: Db, userId: string) =>
  db.productSwipes.filter(
    (swipe) =>
      swipe.userId === userId &&
      swipe.context.kind === "self" &&
      isLike(swipe.decision),
  ).length;

// POST /swipes — решение по карточке. «Хочу» и «Очень хочу» в своей ленте
// кладут товар в вишлист; на 5-м лайке ставится shareUnlockedAt, и ответ
// говорит клиенту запустить бант (TECH_SPEC §6).
export const createSwipe: Handler = async (ctx, { body }) => {
  const input = parseInput(SwipeBodySchema, body);
  const products = await ctx.catalog.products();
  if (!products.some((product) => product.id === input.productId)) {
    throw notFound("Товар не найден");
  }
  const at = nowIso(ctx.clock);

  const response = await ctx.db.write((db): SwipeResponse => {
    const user = requireUser(ctx, db);
    const key = contextKey(input.context);
    // Повторный свайп той же карточки в том же контексте заменяет прошлый.
    db.productSwipes = db.productSwipes.filter(
      (swipe) =>
        !(
          swipe.userId === user.id &&
          swipe.productId === input.productId &&
          contextKey(swipe.context) === key
        ),
    );
    db.productSwipes.push({
      id: `sw_${nanoid(10)}`,
      userId: user.id,
      productId: input.productId,
      decision: input.decision,
      context: input.context,
      at,
    });

    // Передумал: «Мимо» после «Хочу» по тому же товару убирает его из вишлиста.
    if (input.context.kind === "self" && !isLike(input.decision)) {
      const items = db.wishlistItems[user.id] ?? [];
      db.wishlistItems[user.id] = items.filter(
        (item) =>
          !(
            item.status === "active" &&
            item.source.kind === "product" &&
            item.source.productId === input.productId
          ),
      );
    }

    let wishlistItemId: string | undefined;
    if (input.context.kind === "self" && isLike(input.decision)) {
      const items = (db.wishlistItems[user.id] ??= []);
      const priority = input.decision === "superlike" ? "top" : "normal";
      const existing = items.find(
        (item) =>
          item.status === "active" &&
          item.source.kind === "product" &&
          item.source.productId === input.productId,
      );
      if (existing) {
        existing.priority = priority;
        if (input.variantChoice) existing.variantChoice = input.variantChoice;
        wishlistItemId = existing.id;
      } else {
        wishlistItemId = `wi_${nanoid(10)}`;
        items.push({
          id: wishlistItemId,
          ownerId: user.id,
          source: { kind: "product", productId: input.productId },
          priority,
          order: Math.max(-1, ...items.map((item) => item.order)) + 1,
          variantChoice: input.variantChoice,
          status: "active",
          addedAt: at,
        });
      }
    }

    const likeCount = countSelfLikes(db, user.id);
    const meta = (db.wishlistMeta[user.id] ??= {
      ownerId: user.id,
      hideReservationCount: false,
    });
    let shareJustUnlocked = false;
    if (!meta.shareUnlockedAt && likeCount >= SHARE_UNLOCK_LIKES) {
      // Однажды открывшись, шеринг больше не закрывается.
      meta.shareUnlockedAt = at;
      shareJustUnlocked = true;
    }
    return {
      likeCount,
      shareUnlocked: Boolean(meta.shareUnlockedAt),
      shareJustUnlocked,
      wishlistItemId,
    };
  });

  ctx.realtime.publish({
    type: "db:changed",
    scope: response.wishlistItemId ? ["swipes", "wishlist"] : ["swipes"],
    by: ctx.userId ?? "",
  });
  return response;
};

// POST /swipes/undo — отменить последний свайп в контексте; если он положил
// товар в вишлист — убрать его оттуда. Открытый шеринг не закрывается.
export const undoSwipe: Handler = async (ctx, { body }) => {
  const { context } = parseInput(ContextBodySchema, body);
  const key = contextKey(context);
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    let index = -1;
    db.productSwipes.forEach((swipe, i) => {
      if (swipe.userId === user.id && contextKey(swipe.context) === key)
        index = i;
    });
    const swipe = db.productSwipes[index];
    if (!swipe) throw notFound("Нечего вернуть");
    db.productSwipes.splice(index, 1);
    if (context.kind === "self" && isLike(swipe.decision)) {
      const items = db.wishlistItems[user.id] ?? [];
      db.wishlistItems[user.id] = items.filter(
        (item) =>
          !(
            item.status === "active" &&
            item.source.kind === "product" &&
            item.source.productId === swipe.productId
          ),
      );
    }
    return {
      productId: swipe.productId,
      likeCount: countSelfLikes(db, user.id),
      wishlistChanged: context.kind === "self" && isLike(swipe.decision),
    };
  });
  ctx.realtime.publish({
    type: "db:changed",
    scope: result.wishlistChanged ? ["swipes", "wishlist"] : ["swipes"],
    by: ctx.userId ?? "",
  });
  return { productId: result.productId, likeCount: result.likeCount };
};

// POST /swipes/restart — «Начать заново» в конце колоды: пропущенные
// карточки вернутся, лайки остаются (TECH_SPEC §6, п. 5 алгоритма ленты).
export const restartSwipes: Handler = async (ctx, { body }) => {
  const { context } = parseInput(ContextBodySchema, body);
  const key = contextKey(context);
  const removed = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const before = db.productSwipes.length;
    db.productSwipes = db.productSwipes.filter(
      (swipe) =>
        !(
          swipe.userId === user.id &&
          swipe.decision === "pass" &&
          contextKey(swipe.context) === key
        ),
    );
    return before - db.productSwipes.length;
  });
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["swipes"],
    by: ctx.userId ?? "",
  });
  return { removed };
};
