import {
  CreateDateInputSchema,
  type ImportantDate,
  type ImportantDateView,
  type Reminder,
  ReminderIdSchema,
  UpdateDateInputSchema,
} from "@swipeit/core/api/users/types";
import type { Occasion } from "@swipeit/core/api/wishlist/types";
import { importantDateTitle } from "@swipeit/core/config";
import { ApiError, notFound, validation } from "@swipeit/core/errors";
import {
  activeReminder,
  nextAutoNumber,
  nextOccurrence,
} from "@swipeit/core/logic/dates";
import type { RealtimeScope } from "@swipeit/core/realtime/types";
import { parseInput } from "@swipeit/core/parse-input";
import { and, eq } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { ServerContext, ServerHandler, Tx } from "../../context";
import { importantDates, users, wishlistMeta } from "../../db/schema";
import { lockMe, rowToUser } from "../users/queries";

// «Мои даты» и напоминания — как в моке (handlers/dates.ts), на функциях
// dates из core. Всё здесь — личное (BACKEND.md §4.6, п. 3): id владельца
// берётся из сессии, чужого id в запросе нет.

// Больше дат человеку не нужно.
const MAX_DATES = 50;

type DateRow = typeof importantDates.$inferSelect;

const changed = (ctx: ServerContext, scope: RealtimeScope[]) =>
  ctx.events.publish({ type: "db:changed", scope, id: ctx.userId ?? "" });

const rowToDate = (row: DateRow): ImportantDate => ({
  id: row.id,
  ownerId: row.ownerId,
  date: row.date,
  ...(row.preset ? { preset: row.preset as ImportantDate["preset"] } : {}),
  ...(row.label ? { label: row.label } : {}),
  autoNumber: row.autoNumber,
  createdAt: row.createdAt.toISOString(),
});

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

export const datesOf = async (tx: Tx, ownerId: string) =>
  (
    await tx
      .select()
      .from(importantDates)
      .where(eq(importantDates.ownerId, ownerId))
  ).map(rowToDate);

// Повод вишлиста владельца под блокировкой: его меняют правка и удаление
// даты.
const lockMeta = async (tx: Tx, ownerId: string) => {
  const [meta] = await tx
    .select()
    .from(wishlistMeta)
    .where(eq(wishlistMeta.ownerId, ownerId))
    .for("update")
    .limit(1);
  return meta;
};

const isOccasionOf = (occasion: unknown, dateId: string) => {
  const value = occasion as null | Occasion;
  return value?.kind === "important" && value.dateId === dateId;
};

// Повод вишлиста — эта дата: при её правке поправить и повод.
const syncOccasion = async (
  tx: Tx,
  date: ImportantDate,
  now: number,
): Promise<boolean> => {
  const meta = await lockMeta(tx, date.ownerId);
  if (!meta || !isOccasionOf(meta.occasion, date.id)) return false;
  const occasion = { ...(meta.occasion as Occasion) };
  occasion.date = nextOccurrence(date.date, now);
  if (date.preset) occasion.preset = date.preset;
  else delete occasion.preset;
  await tx
    .update(wishlistMeta)
    .set({ occasion })
    .where(eq(wishlistMeta.ownerId, date.ownerId));
  return true;
};

// GET /me/dates — значимые даты владельца, ближайшие сверху.
export const listDates: ServerHandler = async (ctx) => {
  const me = await lockMe(ctx);
  return sortedViews(await datesOf(ctx.tx, me.id), ctx.clock.now());
};

// POST /me/dates { date, preset?, label?, autoNumber? } — как в моке: такая
// дата уже есть — вернуть её; autoNumber оставляем, если номер свободен.
export const createDate: ServerHandler = async (ctx, { body }) => {
  const input = parseInput(CreateDateInputSchema, body);
  const now = ctx.clock.now();
  // Блокировка профиля — записи одного человека по очереди (§2.6): две
  // одинаковые даты из двух вкладок не создадут дубль.
  const me = await lockMe(ctx);
  const dates = await datesOf(ctx.tx, me.id);
  const existing = dates.find((entry) => entry.date === input.date);
  if (existing) return viewOf(existing, now);
  if (dates.length >= MAX_DATES) {
    throw validation(`Дат — не больше ${MAX_DATES}`);
  }
  const label = input.label?.trim() || undefined;
  const wanted = input.autoNumber;
  const numberTaken = dates.some(
    (entry) => !entry.label && !entry.preset && entry.autoNumber === wanted,
  );
  const [row] = await ctx.tx
    .insert(importantDates)
    .values({
      id: `d_${nanoid(10)}`,
      ownerId: me.id,
      date: input.date,
      preset: input.preset ?? null,
      label: label ?? null,
      autoNumber:
        wanted !== undefined && !numberTaken ? wanted : nextAutoNumber(dates),
      createdAt: new Date(now),
    })
    .returning();
  if (!row) throw new Error("Дата не записалась");
  changed(ctx, ["users"]);
  return viewOf(rowToDate(row), now);
};

const findDate = (dates: readonly ImportantDate[], id: string | undefined) => {
  const date = dates.find((entry) => entry.id === id);
  if (!date) throw notFound("Дата не найдена");
  return date;
};

// PATCH /me/dates/:id { label?, date? } — как в моке.
export const updateDate: ServerHandler = async (ctx, { params, body }) => {
  const patch = parseInput(UpdateDateInputSchema, body);
  const now = ctx.clock.now();
  const me = await lockMe(ctx);
  const dates = await datesOf(ctx.tx, me.id);
  const date = { ...findDate(dates, params.id) };
  const others = dates.filter((entry) => entry.id !== date.id);
  if (patch.date !== undefined && patch.date !== date.date) {
    if (others.some((entry) => entry.date === patch.date)) {
      throw new ApiError(409, "CONFLICT", "Такая дата уже есть в твоих датах");
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
  await ctx.tx
    .update(importantDates)
    .set({
      date: date.date,
      label: date.label ?? null,
      autoNumber: date.autoNumber,
    })
    .where(
      and(eq(importantDates.id, date.id), eq(importantDates.ownerId, me.id)),
    );
  await syncOccasion(ctx.tx, date, now);
  changed(ctx, ["users", "wishlist"]);
  return viewOf(date, now);
};

// DELETE /me/dates/:id — удалить. Была поводом вишлиста — повод «Просто
// так». В ответе — удалённая дата для «Отменить».
export const deleteDate: ServerHandler = async (ctx, { params }) => {
  const now = ctx.clock.now();
  const me = await lockMe(ctx);
  const target = findDate(await datesOf(ctx.tx, me.id), params.id);
  await ctx.tx
    .delete(importantDates)
    .where(
      and(eq(importantDates.id, target.id), eq(importantDates.ownerId, me.id)),
    );
  const meta = await lockMeta(ctx.tx, me.id);
  const occasionReset = Boolean(meta && isOccasionOf(meta.occasion, target.id));
  if (occasionReset) {
    await ctx.tx
      .update(wishlistMeta)
      .set({ occasion: { kind: "just_because" } })
      .where(eq(wishlistMeta.ownerId, me.id));
  }
  changed(ctx, occasionReset ? ["users", "wishlist"] : ["users"]);
  return { ok: true, date: viewOf(target, now), occasionReset };
};

const remindersOf = (
  user: Parameters<typeof activeReminder>[0],
  dates: readonly ImportantDate[],
  now: number,
): Reminder[] => {
  const reminder = activeReminder(user, dates, now);
  return reminder ? [reminder] : [];
};

// GET /me/reminders — активное напоминание: 0 или 1.
export const listReminders: ServerHandler = async (ctx) => {
  const me = rowToUser(await lockMe(ctx));
  return remindersOf(me, await datesOf(ctx.tx, me.id), ctx.clock.now());
};

// id «Скрыть» — общая схема core: своя дата или день рождения друга.

// POST /me/reminders/:id/dismiss — «Скрыть» это наступление.
export const dismissReminder: ServerHandler = async (ctx, { params }) => {
  const id = parseInput(ReminderIdSchema, params.id);
  const now = ctx.clock.now();
  const row = await lockMe(ctx);
  // Последние 50 скрытых (ревью R8): старше года — уже не нужны.
  const dismissedReminders = [
    ...new Set([...row.dismissedReminders, id]),
  ].slice(-50);
  await ctx.tx
    .update(users)
    .set({ dismissedReminders })
    .where(eq(users.id, row.id));
  const me = rowToUser({ ...row, dismissedReminders });
  changed(ctx, ["users"]);
  return remindersOf(me, await datesOf(ctx.tx, me.id), now);
};
