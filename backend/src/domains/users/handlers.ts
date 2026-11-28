import { AVATAR_COLORS } from "@swipeit/core/config";
import {
  MarkHintInputSchema,
  type MeResponse,
  NewUserInputSchema,
  UpdateMeInputSchema,
} from "@swipeit/core/api/users/types";
import { validation } from "@swipeit/core/errors";
import { parseInput } from "@swipeit/core/parse-input";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import { createSession, revokeSession } from "../../auth/sessions";
import { reachStep } from "../funnel/steps";
import type { ServerContext, ServerHandler } from "../../context";
import { users, wishlistMeta } from "../../db/schema";
import { lockMe, rowToUser, toMe, type UserRow } from "./queries";

const usersChanged = (ctx: ServerContext, id: string) =>
  ctx.events.publish({ type: "db:changed", scope: ["users"], id });

const unique = <T>(list: readonly T[]) => [...new Set(list)];

// Записать свой профиль и ответить MeResponse (как writeMe мока).
const writeMe = async (
  ctx: ServerContext,
  patch: (me: UserRow) => Partial<typeof users.$inferInsert>,
): Promise<MeResponse> => {
  const me = await lockMe(ctx);
  const changes = patch(me);
  const [row] = await ctx.tx
    .update(users)
    .set(changes)
    .where(eq(users.id, me.id))
    .returning();
  usersChanged(ctx, me.id);
  return toMe(rowToUser(row ?? me));
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
      createdAt,
    })
    .returning();
  await ctx.tx.insert(wishlistMeta).values({ ownerId: id });
  const { token } = await createSession(ctx.tx, id, ctx.clock, ctx.userAgent);
  await reachStep(ctx.tx, id, "profile_created", ctx.clock.now());
  // Новый гость получает профиль при брони или после «Собрать свой
  // вишлист» — ссылку он уже открыл (Q01).
  if (via === "wishlist_link" || via === "reservation") {
    await reachStep(ctx.tx, id, "guest_opened", ctx.clock.now());
  }
  usersChanged(ctx, id);
  if (!row) throw new Error("Профиль не записался");
  return { me: toMe(rowToUser(row)), token };
};

export const getMe: ServerHandler = async (ctx) =>
  toMe(rowToUser(await lockMe(ctx)));

// PATCH /me — как в моке: имя и фон аватара, день рождения, свои интересы и
// «Не моё». Интерес не бывает сразу и своим, и «Не моё».
export const updateMe: ServerHandler = async (ctx, { body }) => {
  const patch = parseInput(UpdateMeInputSchema, body);
  const { interests, mutedInterests } = patch;
  if (interests?.some((id) => mutedInterests?.includes(id))) {
    throw validation("Интерес не может быть и твоим, и «Не моё»");
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
