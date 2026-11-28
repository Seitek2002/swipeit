import type {
  HintId,
  MeResponse,
  Taste,
  User,
} from "@swipeit/core/api/users/types";
import { notFound } from "@swipeit/core/errors";
import { inferInterests } from "@swipeit/core/logic/taste";
import { and, eq } from "drizzle-orm";

import type { ServerContext, Tx } from "../../context";
import { identities, users } from "../../db/schema";

export type UserRow = typeof users.$inferSelect;

// Строка базы → тот же User, что отдаёт мок (§4.1: формы ответов не
// меняются). Пустые списки и null — как отсутствующие необязательные поля.
export const rowToUser = (row: UserRow): User => ({
  id: row.id,
  ...(row.name ? { name: row.name } : {}),
  avatarColor: row.avatarColor as User["avatarColor"],
  ...(row.birthday ? { birthday: row.birthday } : {}),
  interests: row.interests,
  audience: row.audience as User["audience"],
  ...(row.seenHints.length > 0 ? { seenHints: row.seenHints as HintId[] } : {}),
  ...(row.mutedInterests.length > 0
    ? { mutedInterests: row.mutedInterests }
    : {}),
  ...(row.taste ? { taste: row.taste as Taste } : {}),
  ...(row.dismissedReminders.length > 0
    ? { dismissedReminders: row.dismissedReminders }
    : {}),
  // Ботов на сервере нет (BACKEND.md §7).
  isBot: false,
  createdAt: row.createdAt.toISOString(),
});

// Ответ GET /me и маршрутов, что меняют свой профиль: «Похоже, тебе
// нравится» — из вкуса, который хранится в users.taste. telegramLinked — только
// флаг (S03): ни id, ни имя из Telegram в ответ не идут.
export const toMe = (user: User, telegramLinked = false): MeResponse => ({
  ...user,
  inferredInterests: inferInterests(user.taste, user),
  ...(telegramLinked ? { telegramLinked: true as const } : {}),
});

// Привязан ли к профилю вход через Telegram (S03).
export const isTelegramLinked = async (tx: Tx, userId: string) => {
  const [row] = await tx
    .select({ userId: identities.userId })
    .from(identities)
    .where(
      and(eq(identities.userId, userId), eq(identities.provider, "telegram")),
    )
    .limit(1);
  return Boolean(row);
};

// Свой профиль под блокировкой строки (§2.6): записи одного человека идут
// по очереди. Удалённый профиль — как не найденный.
export const lockMe = async (ctx: ServerContext): Promise<UserRow> => {
  const [row] = await ctx.tx
    .select()
    .from(users)
    .where(eq(users.id, ctx.userId ?? ""))
    .for("update")
    .limit(1);
  if (!row || row.deletedAt) throw notFound("Профиль не найден");
  return row;
};

// Свой профиль без блокировки — для чтения (лента, счётчик).
export const readMe = async (ctx: ServerContext): Promise<UserRow> => {
  const row = await readUser(ctx.tx, ctx.userId ?? "");
  if (!row) throw notFound("Профиль не найден");
  return row;
};

export const readUser = async (tx: Tx, id: string): Promise<null | UserRow> => {
  const [row] = await tx.select().from(users).where(eq(users.id, id)).limit(1);
  return row && !row.deletedAt ? row : null;
};
