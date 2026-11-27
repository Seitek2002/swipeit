import {
  SwipeContextInputSchema,
  SwipeInputSchema,
} from "@swipeit/core/api/wishlist/types";
import { nanoid } from "nanoid";

import type { Product } from "../../catalog/types";
import type { User } from "../../users/types";
import type { SwipeResponse } from "../../wishlist/types";
import { type Handler, nowIso } from "../context";
import type { Db } from "../db";
import { notFound } from "../errors";
import { contextKey } from "../feed";
import { checkShareUnlock, countActiveWishes } from "../share-threshold";
import {
  computeTaste,
  inferInterests,
  isTasteJustFormed,
  tasteOf,
} from "../taste";
import { parseInput, requireUser } from "./common";

// Порог шеринга: после 5 «Хочу» вишлист можно отправить (решение владельца
// от 26.11.2026). Считаются лайки, а не свайпы вообще.

const isLike = (decision: string) =>
  decision === "like" || decision === "superlike";

// Вкус — функция от истории свайпов (TECH_SPEC §6 «Вкус»): после любого
// изменения своей ленты пересчитываем его целиком, а не правим на дельту.
// Так «Вернуть» возвращает вкус точно в прежнее состояние. Возвращает,
// поменялись ли выведенные интересы — по ним вкладки перечитывают профиль.
const refreshTaste = (db: Db, user: User, products: readonly Product[]) => {
  const before = inferInterests(
    tasteOf(user, db.productSwipes, products),
    user,
  );
  const taste = computeTaste(
    db.productSwipes.filter((swipe) => swipe.userId === user.id),
    products,
  );
  if (taste) user.taste = taste;
  else delete user.taste;
  return before.join() !== inferInterests(taste, user).join();
};

// POST /swipes — решение по карточке. «Хочу» и «Очень хочу» в своей ленте
// кладут товар в вишлист; на 5-м желании в «Хочу» ставится shareUnlockedAt,
// и ответ говорит клиенту запустить бант (TECH_SPEC §6 «Порог отправки»).
export const createSwipe: Handler = async (ctx, { body }) => {
  const input = parseInput(SwipeInputSchema, body);
  const products = await ctx.catalog.products();
  if (!products.some((product) => product.id === input.productId)) {
    throw notFound("Товар не найден");
  }
  const at = nowIso(ctx.clock);
  // «Мимо» убрал товар из вишлиста — другим вкладкам тоже надо перечитать его.
  let passRemovedItem = false;
  // Выведенные интересы поменялись — профиль («Похоже, тебе нравится») надо
  // перечитать.
  let interestsChanged = false;

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
      variantChoice: input.variantChoice,
      at,
    });

    // Передумал: «Мимо» после «Хочу» по тому же товару убирает его из вишлиста.
    if (input.context.kind === "self" && !isLike(input.decision)) {
      const items = db.wishlistItems[user.id] ?? [];
      const before = items.length;
      db.wishlistItems[user.id] = items.filter(
        (item) =>
          !(
            item.status === "active" &&
            item.source.kind === "product" &&
            item.source.productId === input.productId
          ),
      );
      passRemovedItem = (db.wishlistItems[user.id]?.length ?? 0) < before;
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

    const shareJustUnlocked = checkShareUnlock(db, user.id, at);
    const wishCount = countActiveWishes(db, user.id);
    const meta = db.wishlistMeta[user.id];
    // Вкус — только по своей ленте: выбор по чужой ссылке-фильтру его не
    // трогает (TECH_SPEC §6 «Вкус»).
    let tasteJustFormed = false;
    if (input.context.kind === "self") {
      interestsChanged = refreshTaste(db, user, products);
      tasteJustFormed = isTasteJustFormed(user.taste, user, shareJustUnlocked);
    }
    return {
      wishCount,
      shareUnlocked: Boolean(meta?.shareUnlockedAt),
      shareJustUnlocked,
      tasteJustFormed,
      wishlistItemId,
    };
  });

  ctx.realtime.publish({
    type: "db:changed",
    scope: [
      "swipes",
      ...(response.wishlistItemId || passRemovedItem
        ? (["wishlist"] as const)
        : []),
      ...(interestsChanged ? (["users"] as const) : []),
    ],
    by: ctx.userId ?? "",
  });
  return response;
};

// POST /swipes/undo — отменить последний свайп в контексте; если он положил
// товар в вишлист — убрать его оттуда. Открытый шеринг не закрывается.
export const undoSwipe: Handler = async (ctx, { body }) => {
  const { context } = parseInput(SwipeContextInputSchema, body);
  const key = contextKey(context);
  const products = await ctx.catalog.products();
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
      wishCount: countActiveWishes(db, user.id),
      wishlistChanged: context.kind === "self" && isLike(swipe.decision),
      interestsChanged:
        context.kind === "self" && refreshTaste(db, user, products),
    };
  });
  ctx.realtime.publish({
    type: "db:changed",
    scope: [
      "swipes",
      ...(result.wishlistChanged ? (["wishlist"] as const) : []),
      ...(result.interestsChanged ? (["users"] as const) : []),
    ],
    by: ctx.userId ?? "",
  });
  return { productId: result.productId, wishCount: result.wishCount };
};

// POST /swipes/restart — «Начать заново» в конце колоды: пропущенные
// карточки вернутся, лайки остаются (TECH_SPEC §6, п. 5 алгоритма ленты).
export const restartSwipes: Handler = async (ctx, { body }) => {
  const { context } = parseInput(SwipeContextInputSchema, body);
  const key = contextKey(context);
  const products = await ctx.catalog.products();
  const { removed, interestsChanged } = await ctx.db.write((db) => {
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
    // Убрали «Мимо» — и вкус теперь без них.
    return {
      removed: before - db.productSwipes.length,
      interestsChanged:
        context.kind === "self" && refreshTaste(db, user, products),
    };
  });
  ctx.realtime.publish({
    type: "db:changed",
    scope: interestsChanged ? ["swipes", "users"] : ["swipes"],
    by: ctx.userId ?? "",
  });
  return { removed };
};
