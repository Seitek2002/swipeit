import type { ProductSwipe } from "@swipeit/core/api/wishlist/types";
import { parseContextKey } from "@swipeit/core/logic/feed";
import { asc, eq } from "drizzle-orm";

import type { Tx } from "../../context";
import { productSwipes } from "../../db/schema";

export type SwipeRow = typeof productSwipes.$inferSelect;

// Строка базы → ProductSwipe мока: контекст — из context_key.
export const rowToSwipe = (row: SwipeRow): ProductSwipe => ({
  id: row.id,
  userId: row.userId,
  productId: row.productId,
  decision: row.decision as ProductSwipe["decision"],
  context: parseContextKey(row.contextKey),
  ...(row.variantChoice
    ? { variantChoice: row.variantChoice as Record<string, string> }
    : {}),
  at: row.at.toISOString(),
});

// Все свайпы человека в порядке записи (seq) — по ним считаются вкус и
// «уже свайпнутые» в ленте.
export const swipesOf = async (
  tx: Tx,
  userId: string,
): Promise<ProductSwipe[]> =>
  (
    await tx
      .select()
      .from(productSwipes)
      .where(eq(productSwipes.userId, userId))
      .orderBy(asc(productSwipes.seq))
  ).map(rowToSwipe);
