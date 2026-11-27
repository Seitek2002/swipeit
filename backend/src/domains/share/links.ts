import { notFound } from "@swipeit/core/errors";
import { and, eq, isNull } from "drizzle-orm";
import { customAlphabet } from "nanoid";

import type { ServerContext, Tx } from "../../context";
import { shareLinks } from "../../db/schema";

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

// Код даёт доступ к вишлисту владельца (брони без дружбы, §4.4).
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
        eq(shareLinks.targetId, ownerId),
        isNull(shareLinks.revokedAt),
      ),
    )
    .limit(1);
  return Boolean(row);
};
