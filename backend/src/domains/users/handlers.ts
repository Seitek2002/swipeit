import { AVATAR_COLORS } from "@swipeit/core/config";
import {
  MarkHintInputSchema,
  type MeResponse,
  NewUserInputSchema,
  UpdateMeInputSchema,
} from "@swipeit/core/api/users/types";
import { validation } from "@swipeit/core/errors";
import { parseInput } from "@swipeit/core/parse-input";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { createSession, revokeSession } from "../../auth/sessions";
import { reachStep } from "../funnel/steps";
import { createDefaultList } from "../wishlists/queries";
import type { ServerContext, ServerHandler } from "../../context";
import { friendships, identities, users, wishlistMeta } from "../../db/schema";
import {
  lockMe,
  rowToUser,
  telegramLinkOf,
  toMe,
  type UserRow,
} from "./queries";

// Профиль изменён — себе и друзьям (§5).
const usersChanged = async (ctx: ServerContext, id: string) => {
  const friends = await ctx.tx
    .select({ id: friendships.friendId })
    .from(friendships)
    .where(eq(friendships.userId, id));
  ctx.events.publish({ type: "db:changed", scope: ["users"], id }, [
    id,
    ...friends.map((friend) => friend.id),
  ]);
};

const unique = <T>(list: readonly T[]) => [...new Set(list)];

// Записать свой профиль и ответить MeResponse (как writeMe мока).
const writeMe = async (
  ctx: ServerContext,
  patch: (me: UserRow) => Partial<typeof users.$inferInsert>,
): Promise<MeResponse> => {
  const me = await lockMe(ctx);
  const changes = patch(me);
  // Только переключатель бота (S10) — строку профиля не трогаем.
  const [row] =
    Object.keys(changes).length === 0
      ? [me]
      : await ctx.tx
          .update(users)
          .set(changes)
          .where(eq(users.id, me.id))
          .returning();
  await usersChanged(ctx, me.id);
  return toMe(rowToUser(row ?? me), await telegramLinkOf(ctx.tx, me.id));
};

// POST /users (BACKEND.md §3.1): анонимный профиль и сессия, ответ
// { me, token }. Без имени, со случайным фоном аватара, без демо-друзей.
// Из тела читается только via (Q01) — откуда пришёл профиль; остальные
// поля оставлены в схеме для мока.
export const createUser: ServerHandler = async (ctx, { body }) => {
  const { via } = parseInput(NewUserInputSchema, body ?? {});
  const id = `u_${nanoid(10)}`;
  const createdAt = new Date(ctx.clock.now());
  const [row] = await ctx.tx
    .insert(users)
    .values({
      id,
      avatarColor: ctx.random.pick(AVATAR_COLORS),
      createdVia: via ?? null,
      // Репетиция с верным токеном (M01): пометка до reachStep — шаг
      // profile_created и все следующие не считаются.
      ...(ctx.rehearsal ? { funnelInternal: true } : {}),
      createdAt,
    })
    .returning();
  await ctx.tx.insert(wishlistMeta).values({ ownerId: id });
  // «Общий» — вместе с профилем, в той же транзакции (spec-multi-wishlists
  // §3.3): и при входе через Telegram с новым профилем.
  await createDefaultList(ctx.tx, id, createdAt);
  const { token } = await createSession(ctx.tx, id, ctx.clock, ctx.userAgent);
  await reachStep(ctx.tx, id, "profile_created", ctx.clock.now());
  // Новый гость получает профиль при брони или после «Собрать свой
  // вишлист» — ссылку он уже открыл (Q01).
  if (via === "wishlist_link" || via === "reservation") {
    await reachStep(ctx.tx, id, "guest_opened", ctx.clock.now());
  }
  await usersChanged(ctx, id);
  if (!row) throw new Error("Профиль не записался");
  return { me: toMe(rowToUser(row)), token };
};

export const getMe: ServerHandler = async (ctx) => {
  const me = await lockMe(ctx);
  return toMe(rowToUser(me), await telegramLinkOf(ctx.tx, me.id));
};

// PATCH /me — как в моке: имя и фон аватара, день рождения, свои интересы и
// «Не моё». Интерес не бывает сразу и своим, и «Не моё».
export const updateMe: ServerHandler = async (ctx, { body }) => {
  const patch = parseInput(UpdateMeInputSchema, body);
  const { interests, mutedInterests } = patch;
  if (interests?.some((id) => mutedInterests?.includes(id))) {
    throw validation("Интерес не может быть и твоим, и «Не моё»");
  }
  // «Сообщения от бота в Telegram» (S10) — только у вошедших через
  // Telegram. Включил — снимаем и отметку «бота заблокировали»: не вышло —
  // следующий 403 поставит её снова.
  if (patch.botMessages !== undefined) {
    const linked = await ctx.tx
      .update(identities)
      .set({
        botMessages: patch.botMessages,
        ...(patch.botMessages ? { botBlockedAt: null } : {}),
      })
      .where(
        and(
          eq(identities.userId, ctx.userId ?? ""),
          eq(identities.provider, "telegram"),
        ),
      )
      .returning({ userId: identities.userId });
    if (linked.length === 0) {
      throw validation("Сначала войди через Telegram");
    }
  }
  return writeMe(ctx, (me) => {
    const next: Partial<typeof users.$inferInsert> = {};
    if (patch.name !== undefined) next.name = patch.name;
    if (patch.avatarColor !== undefined) next.avatarColor = patch.avatarColor;
    if (patch.birthday !== undefined) next.birthday = patch.birthday;
    if (patch.audience !== undefined) next.audience = patch.audience;
    let ownInterests = me.interests;
    let muted = me.mutedInterests;
    if (interests !== undefined) {
      ownInterests = unique(interests);
      muted = muted.filter((id) => !interests.includes(id));
    }
    if (mutedInterests !== undefined) {
      muted = unique(mutedInterests);
      ownInterests = ownInterests.filter((id) => !mutedInterests.includes(id));
    }
    if (interests !== undefined || mutedInterests !== undefined) {
      next.interests = ownInterests;
      next.mutedInterests = muted;
    }
    return next;
  });
};

// POST /me/hints { id } — подсказка показана. Повтор ничего не меняет.
export const markHintSeen: ServerHandler = async (ctx, { body }) => {
  const { id } = parseInput(MarkHintInputSchema, body);
  return writeMe(ctx, (me) => ({ seenHints: unique([...me.seenHints, id]) }));
};

// POST /auth/logout (§3.4): закрыть сессию этого устройства. Остальные
// устройства человека остаются в профиле.
export const logout: ServerHandler = async (ctx) => {
  if (ctx.sessionId) await revokeSession(ctx.tx, ctx.sessionId, ctx.clock);
  return { ok: true };
};
