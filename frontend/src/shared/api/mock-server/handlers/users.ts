import { nanoid } from "nanoid";

import { AVATAR_COLORS } from "@/shared/config";
import { daysUntilBirthday } from "@/shared/lib/format";

import {
  type FriendSummary,
  MarkHintInputSchema,
  type MeResponse,
  NewUserInputSchema,
  UpdateMeInputSchema,
  type User,
} from "../../users/types";
import { type Handler, type HandlerContext, nowIso } from "../context";
import { notFound } from "../errors";
import { BOT_IDS, DEMO_USER_ID } from "../seed";
import { parseInput, requireUser } from "./common";

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

const usersChanged = (ctx: HandlerContext, id: string) =>
  ctx.realtime.publish({ type: "db:changed", scope: ["users"], id, by: id });

// Ответ GET /me и всех маршрутов, что меняют свой профиль. Вычисляемые поля
// (выведенные интересы — T23) добавляются здесь, в базе их нет.
export const toMe = (user: User): MeResponse => user;

// Профиль без имени — «человек, которого никто не узнает»: его не
// показываем другим в «В этой сети», /presence и плашке сети (TECH_SPEC
// §7a). Боты всегда с именем.
export const isNamelessHuman = (user: User) => !user.isBot && !user.name;

// POST /users — профиль создаётся сам при первом входе, без анкеты (DESIGN
// §8.1): без имени, со случайным фоном аватара, без интересов, «всем».
// Тело необязательное — поля оставлены для совместимости со старыми
// клиентами и тестами. Новичку сразу добавляются демо-друзья.
export const createUser: Handler = async (ctx, { body }) => {
  const input = parseInput(NewUserInputSchema, body ?? {});
  const user: User = {
    id: `u_${nanoid(10)}`,
    ...(input.name ? { name: input.name } : {}),
    // Через ctx.random: в тестах цвет предсказуем, в бою — crypto.
    avatarColor: input.avatarColor ?? ctx.random.pick(AVATAR_COLORS),
    ...(input.birthday ? { birthday: input.birthday } : {}),
    interests: input.interests ?? [],
    audience: input.audience ?? "all",
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
  usersChanged(ctx, user.id);
  return toMe(user);
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
  usersChanged(ctx, user.id);
  return toMe(user);
};

export const getMe: Handler = async (ctx) =>
  toMe(requireUser(ctx, await ctx.db.read()));

// PATCH /me — имя и фон аватара в любой момент (NameSheet, профиль).
export const updateMe: Handler = async (ctx, { body }) => {
  const patch = parseInput(UpdateMeInputSchema, body);
  const user = await ctx.db.write((db) => {
    const me = requireUser(ctx, db);
    if (patch.name !== undefined) me.name = patch.name;
    if (patch.avatarColor !== undefined) me.avatarColor = patch.avatarColor;
    if (patch.birthday !== undefined) me.birthday = patch.birthday;
    if (patch.interests !== undefined)
      me.interests = [...new Set(patch.interests)];
    if (patch.audience !== undefined) me.audience = patch.audience;
    return me;
  });
  usersChanged(ctx, user.id);
  return toMe(user);
};

// POST /me/hints { id } — подсказка показана (обучающая карточка, тост
// «вкус сложился»). Повтор ничего не меняет.
export const markHintSeen: Handler = async (ctx, { body }) => {
  const { id } = parseInput(MarkHintInputSchema, body);
  const user = await ctx.db.write((db) => {
    const me = requireUser(ctx, db);
    const seen = new Set(me.seenHints ?? []);
    seen.add(id);
    me.seenHints = [...seen];
    return me;
  });
  usersChanged(ctx, user.id);
  return toMe(user);
};

// POST /demo/hints/reset — «Показать обучение снова» в демо-панели: снять
// отметки, обучающая карточка снова первая.
export const resetHints: Handler = async (ctx) => {
  const user = await ctx.db.write((db) => {
    const me = requireUser(ctx, db);
    delete me.seenHints;
    return me;
  });
  usersChanged(ctx, user.id);
  return toMe(user);
};

export const getUser: Handler = async (ctx, { params }) => {
  const db = await ctx.db.read();
  const user = db.users[params.id ?? ""];
  if (!user) throw notFound("Профиль не найден");
  return user;
};

const byName = (a: User, b: User) =>
  (a.name ?? "").localeCompare(b.name ?? "", "ru");

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
    // Безымянного никто не узнает — в «В этой сети» его нет, пока он не
    // назовётся (DESIGN §8.11).
    .filter(
      (user): user is User => user !== undefined && !isNamelessHuman(user),
    )
    .map((user) => ({
      user: { ...user, name: user.name ?? "" },
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
