import { findOccasionWishlist } from "@swipeit/core/logic/wishlists";
import { nanoid } from "nanoid";

import { importantDateTitle } from "@/shared/config";

import {
  CreateDateInputSchema,
  type ImportantDate,
  type ImportantDateView,
  type Reminder,
  ReminderIdSchema,
  UpdateDateInputSchema,
  type User,
} from "../../users/types";
import { type Handler, type HandlerContext, nowIso } from "../context";
import {
  activeReminder,
  nextAutoNumber,
  nextOccurrence,
  reminderJumpTarget,
} from "../dates";
import type { Db } from "../db";
import { ApiError, notFound, validation } from "../errors";
import { countActiveWishes } from "../share-threshold";
import { defaultListOf, ensureLists, listsOf } from "../wishlists";
import { parseInput, requireUser } from "./common";

// «Мои даты» и напоминания (TECH_SPEC §6 «Даты и напоминания», DESIGN §8.4,
// §8.9). Всё здесь — личное: маршруты отдают данные только владельцу (id
// берётся из сессии, чужого id в запросе нет), в ссылку вишлиста попадает
// только дата повода.

// Больше дат человеку не нужно, а базе в localStorage — лишнее.
const MAX_DATES = 50;

const changed = (ctx: HandlerContext, scope: Array<"users" | "wishlist">) =>
  ctx.realtime.publish({ type: "db:changed", scope, by: ctx.userId ?? "" });

const datesOf = (db: Db, userId: string) => (db.importantDates[userId] ??= []);

const findDate = (db: Db, userId: string, id: string | undefined) => {
  const date = datesOf(db, userId).find((entry) => entry.id === id);
  if (!date) throw notFound("Дата не найдена");
  return date;
};

const viewOf = (date: ImportantDate, now: number): ImportantDateView => ({
  ...date,
  title: importantDateTitle(date),
  nextDate: nextOccurrence(date.date, now),
});

// Ближайшие — первыми (так же стоят строки шага «К какому дню…»).
const sortedViews = (dates: readonly ImportantDate[], now: number) =>
  dates
    .map((date) => viewOf(date, now))
    .sort(
      (a, b) =>
        a.nextDate.localeCompare(b.nextDate) ||
        a.createdAt.localeCompare(b.createdAt),
    );

// Повод вишлиста — эта дата: при её правке поправить и повод (во всех
// вишлистах с этой датой — повод у каждого свой, spec-multi-wishlists §2.1).
const syncOccasion = (db: Db, user: User, date: ImportantDate, now: number) => {
  for (const list of ensureLists(db, user.id)) {
    const occasion = list.occasion;
    if (occasion?.kind !== "important" || occasion.dateId !== date.id) continue;
    occasion.date = nextOccurrence(date.date, now);
    if (date.preset) occasion.preset = date.preset;
    else delete occasion.preset;
  }
};

// GET /me/dates — значимые даты владельца, ближайшие сверху.
export const listDates: Handler = async (ctx) => {
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  return sortedViews(db.importantDates[user.id] ?? [], ctx.clock.now());
};

// POST /me/dates { date, preset?, label?, autoNumber? } — сохранить дату из
// шага «Что за повод?» или «+ Добавить дату». Такая дата уже есть — вернуть
// её, дубль не создаём. autoNumber приходит только с «Отменить» после
// удаления: оставляем его, если номер свободен.
export const createDate: Handler = async (ctx, { body }) => {
  const input = parseInput(CreateDateInputSchema, body);
  const now = ctx.clock.now();
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const dates = datesOf(db, user.id);
    const existing = dates.find((entry) => entry.date === input.date);
    if (existing) return { created: false, date: existing };
    if (dates.length >= MAX_DATES) {
      throw validation(`Дат — не больше ${MAX_DATES}`);
    }
    const label = input.label?.trim() || undefined;
    const free = nextAutoNumber(dates);
    const wanted = input.autoNumber;
    const numberTaken = dates.some(
      (entry) => !entry.label && !entry.preset && entry.autoNumber === wanted,
    );
    const date: ImportantDate = {
      id: `d_${nanoid(10)}`,
      ownerId: user.id,
      date: input.date,
      ...(input.preset ? { preset: input.preset } : {}),
      ...(label ? { label } : {}),
      autoNumber: wanted !== undefined && !numberTaken ? wanted : free,
      createdAt: nowIso(ctx.clock),
    };
    dates.push(date);
    return { created: true, date };
  });
  if (result.created) changed(ctx, ["users"]);
  return viewOf(result.date, now);
};

// PATCH /me/dates/:id { label?, date? } — переименовать или сменить дату.
// Пустое название или null возвращает подпись готового повода или
// «Значимая дата N» — номер наименьший свободный (старый мог занять другой
// датой, пока у этой было своё название).
export const updateDate: Handler = async (ctx, { params, body }) => {
  const patch = parseInput(UpdateDateInputSchema, body);
  const now = ctx.clock.now();
  const result = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const date = findDate(db, user.id, params.id);
    const others = datesOf(db, user.id).filter((entry) => entry.id !== date.id);
    if (patch.date !== undefined && patch.date !== date.date) {
      if (others.some((entry) => entry.date === patch.date)) {
        throw new ApiError(
          409,
          "CONFLICT",
          "Такая дата уже есть в твоих датах",
        );
      }
      date.date = patch.date;
    }
    if (patch.label !== undefined) {
      const label = patch.label?.trim();
      if (label) {
        date.label = label;
      } else if (date.label) {
        delete date.label;
        if (!date.preset) date.autoNumber = nextAutoNumber(others);
      }
    }
    syncOccasion(db, user, date, now);
    return date;
  });
  changed(ctx, ["users", "wishlist"]);
  return viewOf(result, now);
};

// DELETE /me/dates/:id — удалить. Если дата была поводом вишлиста, повод —
// «Просто так» (TECH_SPEC §6). В ответе — удалённая дата: по ней клиент
// делает «Отменить» (POST /me/dates с тем же autoNumber).
export const deleteDate: Handler = async (ctx, { params }) => {
  const now = ctx.clock.now();
  const { date, occasionReset } = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const target = findDate(db, user.id, params.id);
    db.importantDates[user.id] = datesOf(db, user.id).filter(
      (entry) => entry.id !== target.id,
    );
    let reset = false;
    for (const list of ensureLists(db, user.id)) {
      if (
        list.occasion?.kind !== "important" ||
        list.occasion.dateId !== target.id
      ) {
        continue;
      }
      list.occasion = { kind: "just_because" };
      reset = true;
    }
    return { date: target, occasionReset: reset };
  });
  changed(ctx, occasionReset ? ["users", "wishlist"] : ["users"]);
  return { ok: true, date: viewOf(date, now), occasionReset };
};

// Новый год (P06): нужны число желаний и нынешний повод вишлиста —
// вишлиста с поводом «Новый год», если он есть, иначе «Общего».
const newYearContextOf = (db: Db, userId: string) => {
  const lists = listsOf(db, userId);
  return {
    wishCount: countActiveWishes(db, userId),
    occasion: (findOccasionWishlist(lists, "new_year") ?? defaultListOf(lists))
      .occasion,
  };
};

const remindersOf = (db: Db, user: User, now: number): Reminder[] => {
  const reminder = activeReminder(
    user,
    db.importantDates[user.id] ?? [],
    now,
    newYearContextOf(db, user.id),
  );
  return reminder ? [reminder] : [];
};

// GET /me/reminders — активное напоминание: 0 или 1 (массив — чтобы потом
// показывать несколько без смены контракта).
export const listReminders: Handler = async (ctx) => {
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  return remindersOf(db, user, ctx.clock.now());
};

// id «Скрыть» — общая схема core: своя дата или день рождения друга.

// POST /me/reminders/:id/dismiss — «Скрыть». Только это наступление: у
// следующего года уже другой id.
export const dismissReminder: Handler = async (ctx, { params }) => {
  const id = parseInput(ReminderIdSchema, params.id);
  const now = ctx.clock.now();
  const reminders = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    // Последние 50 скрытых — как на сервере.
    user.dismissedReminders = [
      ...new Set([...(user.dismissedReminders ?? []), id]),
    ].slice(-50);
    return remindersOf(db, user, now);
  });
  changed(ctx, ["users"]);
  return reminders;
};

// POST /demo/clock/to-reminder — «Перемотать к напоминанию» в демо-панели:
// часы встают так, чтобы до ближайшего нескрытого наступления своей даты
// осталось 30 дней. Смещение — в настройках демо (в lan оно общее).
export const jumpToReminder: Handler = async (ctx) => {
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  const now = ctx.clock.now();
  const target = reminderJumpTarget(
    user,
    db.importantDates[user.id] ?? [],
    now,
  );
  if (!target) throw validation("Сначала отправь вишлист с датой");
  // Считаем от текущих часов, а не от Date.now(): так же работает и сервер в
  // lan, и часы в тестах.
  const settings = ctx.settings.update({
    clockOffsetMs: ctx.settings.get().clockOffsetMs + (target.at - now),
  });
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["settings", "users"],
    by: ctx.userId ?? "system",
  });
  return {
    ok: true,
    clockOffsetMs: settings.clockOffsetMs,
    reminder: activeReminder(user, db.importantDates[user.id] ?? [], target.at),
  };
};
