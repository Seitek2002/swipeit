import { notFound } from "@swipeit/core/errors";
import { and, eq, isNull } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import type { ServerContext, Tx } from "../../context";
import { shareLinks, wishlists } from "../../db/schema";
import { ensureDefaultList, type WishlistRow } from "../wishlists/queries";

// Короткие ссылки (BACKEND.md §6.2): код — 10 случайных символов
// [A-Za-z0-9], около 59 бит. Случайность — криптографическая (nanoid), а не
// ctx.random: код нельзя предсказать даже по сиду.
export const SHARE_CODE_LENGTH = 10;
const newCode = customAlphabet(
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz",
  SHARE_CODE_LENGTH,
);

export type ShareKind =
  "pick_answer" | "pick_request" | "plan" | "santa" | "wishlist";

export type ShareLinkRow = typeof shareLinks.$inferSelect;

export const shareUrl = (ctx: ServerContext, code: string) =>
  `${ctx.publicShareUrl}/s/${code}`;

const liveLinkOf = async (tx: Tx, kind: ShareKind, targetId: string) => {
  const [row] = await tx
    .select()
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.kind, kind),
        eq(shareLinks.targetId, targetId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .limit(1);
  return row;
};

// Живая ссылка на цель: есть — та же, нет — новая. Одна живая ссылка на
// цель (уникальный индекс): две одновременные отправки дадут один код.
export const ensureShareLink = async (
  ctx: ServerContext,
  kind: ShareKind,
  targetId: string,
  ownerId: string,
): Promise<{ code: string; url: string }> => {
  const existing = await liveLinkOf(ctx.tx, kind, targetId);
  if (existing)
    return { code: existing.code, url: shareUrl(ctx, existing.code) };
  await ctx.tx
    .insert(shareLinks)
    .values({
      code: newCode(),
      kind,
      ownerId,
      targetId,
      createdAt: new Date(ctx.clock.now()),
    })
    .onConflictDoNothing();
  const row = await liveLinkOf(ctx.tx, kind, targetId);
  if (!row) throw new Error("Ссылка не записалась");
  return { code: row.code, url: shareUrl(ctx, row.code) };
};

// Живая ссылка по коду; нет или закрыта — «Ссылка больше не работает».
export const resolveShareLink = async (
  tx: Tx,
  code: string | undefined,
): Promise<ShareLinkRow> => {
  const [row] = await tx
    .select()
    .from(shareLinks)
    .where(and(eq(shareLinks.code, code ?? ""), isNull(shareLinks.revokedAt)))
    .limit(1);
  if (!row) throw notFound("Ссылка больше не работает");
  return row;
};

// ── Ссылки на вишлист (spec-multi-wishlists §3.3) ────────────────────────
// target_id ссылки на вишлист:
// - «u_…» — id владельца: так писались все ссылки до 0015. Это «Общий»
//   владельца. Миграция ссылок не трогает, и откат кода их не ломает;
// - «wl_…» — сам вишлист.

// Вишлист ссылки: «Общий» владельца или сам вишлист. Удалённого вишлиста
// нет — null (его ссылка закрыта, сюда она не доходит).
export const wishlistOfLink = async (
  tx: Tx,
  link: Pick<ShareLinkRow, "kind" | "ownerId" | "targetId">,
): Promise<null | WishlistRow> => {
  if (link.kind !== "wishlist") return null;
  if (!link.targetId.startsWith("wl_")) {
    return ensureDefaultList(tx, link.ownerId);
  }
  const [row] = await tx
    .select()
    .from(wishlists)
    .where(
      and(eq(wishlists.id, link.targetId), eq(wishlists.ownerId, link.ownerId)),
    )
    .limit(1);
  return row ?? null;
};

// Живая ссылка вишлиста. «Общий» сначала ищет ссылку «u_<владелец>»:
// человек, отправлявший вишлист до 0015, получает тот же код.
export const ensureWishlistLink = async (
  ctx: ServerContext,
  list: Pick<WishlistRow, "id" | "isDefault" | "ownerId">,
): Promise<{ code: string; url: string }> => {
  if (list.isDefault) {
    const legacy = await liveLinkOf(ctx.tx, "wishlist", list.ownerId);
    if (legacy) return { code: legacy.code, url: shareUrl(ctx, legacy.code) };
  }
  return ensureShareLink(ctx, "wishlist", list.id, list.ownerId);
};

// Живая ссылка вишлиста владельца — когда создана (sharedAt в ряду
// вишлистов): id вишлиста → время. «u_…» — у «Общего».
export const liveWishlistLinksOf = async (tx: Tx, ownerId: string) => {
  const rows = await tx
    .select({ targetId: shareLinks.targetId, createdAt: shareLinks.createdAt })
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.kind, "wishlist"),
        eq(shareLinks.ownerId, ownerId),
        isNull(shareLinks.revokedAt),
      ),
    );
  return new Map(rows.map((row) => [row.targetId, row.createdAt]));
};

// Удалили вишлист — его ссылка закрывается (§2.7): старая ссылка покажет
// «Этот вишлист удалили».
export const revokeWishlistLinks = (tx: Tx, listId: string, at: Date) =>
  tx
    .update(shareLinks)
    .set({ revokedAt: at })
    .where(
      and(
        eq(shareLinks.kind, "wishlist"),
        eq(shareLinks.targetId, listId),
        isNull(shareLinks.revokedAt),
      ),
    );

// Код даёт доступ к вишлисту владельца (брони без дружбы, §4.4): живая
// ссылка на любой его вишлист. По владельцу ссылки (owner_id), а не по
// target_id: у ссылок «wl_…» там id вишлиста.
export const isWishlistCode = async (
  tx: Tx,
  code: string | undefined,
  ownerId: string,
) => {
  if (!code) return false;
  const [row] = await tx
    .select({ code: shareLinks.code })
    .from(shareLinks)
    .where(
      and(
        eq(shareLinks.code, code),
        eq(shareLinks.kind, "wishlist"),
        eq(shareLinks.ownerId, ownerId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
};
