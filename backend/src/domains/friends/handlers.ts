import type { FriendSummary, User } from "@swipeit/core/api/users/types";
import { notFound } from "@swipeit/core/errors";
import { daysUntilBirthday } from "@swipeit/core/format";
import { and, eq, isNull, sql } from "drizzle-orm";

import type { Clock, ServerHandler, Tx } from "../../context";
import { friendships, users } from "../../db/schema";
import { lockMe, readUser, rowToUser, type UserRow } from "../users/queries";

// Друзья на сервере (BACKEND.md §4.3): ботов нет, дружба появляется сама —
// при вступлении в план или Санту и при открытии вишлиста по короткой ссылке.

export type FriendSource = "plan" | "santa" | "wishlist_link";

// Дружба в обе стороны; повтор ничего не меняет (и не меняет source первой
// встречи). Себе в друзья — нельзя.
export const makeFriends = async (
  tx: Tx,
  a: string,
  b: string,
  source: FriendSource,
  clock: Clock,
): Promise<boolean> => {
  if (a === b) return false;
  const createdAt = new Date(clock.now());
  // Строки — всегда в одном порядке (меньший id первым, ревью R3): двое,
  // одновременно открывшие вишлисты друг друга, иначе ждали бы друг друга
  // крест-накрест, и Postgres ронял одну транзакцию с deadlock → 500.
  const [low, high] = a < b ? [a, b] : [b, a];
  const inserted = await tx
    .insert(friendships)
    .values([
      { userId: low, friendId: high, source, createdAt },
      { userId: high, friendId: low, source, createdAt },
    ])
    .onConflictDoNothing()
    .returning({ userId: friendships.userId });
  return inserted.length > 0;
};

export const areFriends = async (tx: Tx, a: string, b: string) => {
  const [row] = await tx
    .select({ userId: friendships.userId })
    .from(friendships)
    .where(and(eq(friendships.userId, a), eq(friendships.friendId, b)))
    .limit(1);
  return Boolean(row);
};

// Соучастники — в одном плане или одной игре Санты.
const areCoParticipants = async (tx: Tx, a: string, b: string) => {
  const { rows } = await tx.execute<{ found: boolean }>(sql`
    select exists (
      select 1 from plan_participants mine
      join plan_participants theirs on theirs.plan_id = mine.plan_id
      where mine.user_id = ${a} and theirs.user_id = ${b}
    ) or exists (
      select 1 from santa_members mine
      join santa_members theirs on theirs.game_id = mine.game_id
      where mine.user_id = ${a} and theirs.user_id = ${b}
    ) as found
  `);
  return Boolean(rows[0]?.found);
};

// Профиль глазами друга (§4.4): имя, фон аватара и день рождения. Ничего
// личного (§4.6, п. 4): вкуса, «Не моё», подсказок, скрытых напоминаний.
// Соучастнику плана или игры — ещё и без дня рождения.
export const friendView = (row: UserRow, withBirthday = true) =>
  ({
    id: row.id,
    ...(row.name ? { name: row.name } : {}),
    avatarColor: row.avatarColor,
    ...(withBirthday && row.birthday ? { birthday: row.birthday } : {}),
  }) as User;

// GET /users/:id: себе — полный профиль, другу — с днём рождения,
// соучастнику — без него, остальным — NOT_FOUND (§4.4, §4.6, п. 5): не
// говорим даже, что такой профиль есть.
export const getUser: ServerHandler = async (ctx, { params }) => {
  const me = await lockMe(ctx);
  const id = params.id ?? "";
  if (id === me.id) return rowToUser(me);
  const user = await readUser(ctx.tx, id);
  if (user) {
    if (await areFriends(ctx.tx, me.id, user.id)) return friendView(user);
    if (await areCoParticipants(ctx.tx, me.id, user.id)) {
      return friendView(user, false);
    }
  }
  throw notFound("Профиль не найден");
};

const byName = (a: User, b: User) =>
  (a.name ?? "").localeCompare(b.name ?? "", "ru");

// GET /friends — как в моке: без безымянных, ближайшие дни рождения сверху,
// без даты — в конце по имени.
export const listFriends: ServerHandler = async (ctx) => {
  const me = await lockMe(ctx);
  const now = ctx.clock.now();
  const rows = await ctx.tx
    .select({ user: users })
    .from(friendships)
    .innerJoin(users, eq(users.id, friendships.friendId))
    .where(and(eq(friendships.userId, me.id), isNull(users.deletedAt)));
  const friends: FriendSummary[] = rows
    .map(({ user }) => user)
    .filter((user) => Boolean(user.name?.trim()))
    .map((user) => ({
      user: { ...friendView(user), name: user.name ?? "" },
      daysToBirthday: user.birthday
        ? daysUntilBirthday(user.birthday, now)
        : null,
    }));
  return friends.sort((a, b) => {
    if (a.daysToBirthday === null && b.daysToBirthday === null) {
      return byName(a.user, b.user);
    }
    if (a.daysToBirthday === null) return 1;
    if (b.daysToBirthday === null) return -1;
    return a.daysToBirthday - b.daysToBirthday;
  });
};
