import { and, eq, isNull } from "drizzle-orm";
import { nanoid } from "nanoid";
import { createHash, randomBytes } from "node:crypto";

import type { Clock, Tx } from "../context";
import type { Database } from "../db/client";
import { sessions, users } from "../db/schema";

// Сессии (BACKEND.md §3.2): токен — 32 случайных байта в base64url, в базе —
// только SHA-256 от него. Не пользовались 180 дней — закрыта; last_used_at
// обновляется не чаще раза в час.
export const SESSION_IDLE_MS = 180 * 24 * 60 * 60 * 1000;
const TOUCH_EVERY_MS = 60 * 60 * 1000;

export const hashToken = (token: string): Buffer =>
  createHash("sha256").update(token).digest();

export const createSession = async (
  tx: Tx,
  userId: string,
  clock: Clock,
  userAgent: null | string,
): Promise<{ sessionId: string; token: string }> => {
  const token = randomBytes(32).toString("base64url");
  const sessionId = `ss_${nanoid(16)}`;
  const at = new Date(clock.now());
  await tx.insert(sessions).values({
    id: sessionId,
    userId,
    tokenHash: hashToken(token),
    createdAt: at,
    lastUsedAt: at,
    userAgent: userAgent?.slice(0, 200) ?? null,
  });
  return { sessionId, token };
};

// Токен → пользователь. null — токена нет в базе, сессия закрыта,
// простаивала дольше 180 дней или профиль удалён.
export const resolveSession = async (
  db: Database,
  token: string,
  clock: Clock,
): Promise<null | {
  // Свой профиль команды (funnel_internal): его ошибки в отчёте — отдельно.
  internal: boolean;
  sessionId: string;
  userId: string;
}> => {
  const [row] = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      lastUsedAt: sessions.lastUsedAt,
      internal: users.funnelInternal,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        isNull(sessions.revokedAt),
        isNull(users.deletedAt),
      ),
    )
    .limit(1);
  if (!row) return null;
  const now = clock.now();
  const idle = now - row.lastUsedAt.getTime();
  if (idle > SESSION_IDLE_MS) {
    await db
      .update(sessions)
      .set({ revokedAt: new Date(now) })
      .where(eq(sessions.id, row.id));
    return null;
  }
  if (idle > TOUCH_EVERY_MS) {
    await db
      .update(sessions)
      .set({ lastUsedAt: new Date(now) })
      .where(eq(sessions.id, row.id));
  }
  return { sessionId: row.id, userId: row.userId, internal: row.internal };
};

export const revokeSession = (tx: Tx, sessionId: string, clock: Clock) =>
  tx
    .update(sessions)
    .set({ revokedAt: new Date(clock.now()) })
    .where(eq(sessions.id, sessionId));
