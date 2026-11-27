import { nanoid } from "nanoid";
import { z } from "zod";

import { daysUntilBirthday } from "@/shared/lib/format";

import {
  type FriendSummary,
  NewUserInputSchema,
  UpdateMeInputSchema,
  type User,
} from "../../users/types";
import { type Handler, nowIso } from "../context";
import { notFound } from "../errors";
import { BOT_IDS, DEMO_USER_ID } from "../seed";
import { parseInput, requireUser } from "./common";

const NAME_MAX = 40;

const NewUserBodySchema = NewUserInputSchema.extend({
  name: z.string().trim().min(1, "Напиши имя").max(NAME_MAX),
});

const UpdateMeBodySchema = UpdateMeInputSchema.extend({
  name: z.string().trim().min(1, "Напиши имя").max(NAME_MAX).optional(),
});

const addFriends = (
  friends: Record<string, string[]>,
  userId: string,
  others: string[],
) => {
  const own = new Set(friends[userId] ?? []);
  for (const other of others) {
    if (other === userId) continue;
    own.add(other);
    const theirs = new Set(friends[other] ?? []);
    theirs.add(userId);
    friends[other] = [...theirs];
  }
  friends[userId] = [...own];
};

// POST /users — профиль из онбординга. Новичку сразу добавляются демо-друзья.
export const createUser: Handler = async (ctx, { body }) => {
  const input = parseInput(NewUserBodySchema, body);
  const user: User = {
    ...input,
    id: `u_${nanoid(10)}`,
    isBot: false,
    createdAt: nowIso(ctx.clock),
  };
  await ctx.db.write((db) => {
    db.users[user.id] = user;
    db.wishlistItems[user.id] = [];
    db.wishlistMeta[user.id] = {
      ownerId: user.id,
      hideReservationCount: false,
    };
    addFriends(
      db.friends,
      user.id,
      BOT_IDS.filter((id) => db.users[id]),
    );
  });
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["users"],
    id: user.id,
    by: user.id,
  });
  return user;
};

// POST /auth/demo — войти как «Айгерим» с готовым вишлистом. Она перестаёт
// быть ботом, чтобы боты не действовали от её имени.
export const loginDemo: Handler = async (ctx) => {
  const user = await ctx.db.write((db) => {
    const demo = db.users[DEMO_USER_ID];
    if (!demo)
      throw notFound("Демо-пользователь не найден — сбрось демо-данные");
    demo.isBot = false;
    return demo;
  });
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["users"],
    id: user.id,
    by: user.id,
  });
  return user;
};

export const getMe: Handler = async (ctx) =>
  requireUser(ctx, await ctx.db.read());

export const updateMe: Handler = async (ctx, { body }) => {
  const patch = parseInput(UpdateMeBodySchema, body);
  const user = await ctx.db.write((db) => {
    const me = requireUser(ctx, db);
    Object.assign(me, patch);
    return me;
  });
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["users"],
    id: user.id,
    by: user.id,
  });
  return user;
};

export const getUser: Handler = async (ctx, { params }) => {
  const db = await ctx.db.read();
  const user = db.users[params.id ?? ""];
  if (!user) throw notFound("Профиль не найден");
  return user;
};

// GET /friends — ближайшие дни рождения сверху, без даты — в конце по имени.
export const listFriends: Handler = async (ctx) => {
  const db = await ctx.db.read();
  const me = requireUser(ctx, db);
  const now = ctx.clock.now();
  // В lan все люди сервера — друзья друг другу и демо-ботам (TECH_SPEC
  // §7a): список строится из всех профилей, а не из связей.
  const ids =
    ctx.mode === "lan"
      ? Object.keys(db.users).filter((id) => id !== me.id)
      : (db.friends[me.id] ?? []);
  const friends: FriendSummary[] = ids
    .map((id) => db.users[id])
    .filter((user): user is User => Boolean(user))
    .map((user) => ({
      user,
      daysToBirthday: user.birthday
        ? daysUntilBirthday(user.birthday, now)
        : null,
    }));
  return friends.sort((a, b) => {
    if (a.daysToBirthday === null && b.daysToBirthday === null) {
      return a.user.name.localeCompare(b.user.name, "ru");
    }
    if (a.daysToBirthday === null) return 1;
    if (b.daysToBirthday === null) return -1;
    return a.daysToBirthday - b.daysToBirthday;
  });
};
