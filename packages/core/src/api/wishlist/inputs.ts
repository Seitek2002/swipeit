import { z } from "zod";

import { CustomWishSchema, OccasionSchema } from "./types";

// Тела запросов своего вишлиста — общие для мока и сервера (BACKEND.md B07).

// POST /wishlist/items — своё желание: название, цена, ссылка, фото.
export const CustomWishInputSchema = CustomWishSchema.extend({
  title: z.string().trim().min(1, "Напиши, что хочешь").max(80),
  // Длиннее ссылка не влезет в ссылку на вишлист (share-codec).
  url: z.string().trim().max(500, "Ссылка слишком длинная").optional(),
}).refine(
  (custom) =>
    custom.priceMin === undefined ||
    custom.priceMax === undefined ||
    custom.priceMin <= custom.priceMax,
  { message: "Цена «от» больше цены «до»" },
);

// PATCH /wishlist/items/:id — вариант, заметка, «Очень хочу».
export const PatchItemInputSchema = z.object({
  priority: z.enum(["normal", "top"]).optional(),
  variantChoice: z.record(z.string(), z.string()).optional(),
  // Пустая строка — убрать заметку.
  note: z.string().max(140, "Заметка — до 140 символов").optional(),
});

// POST /wishlist/reorder { ids } — все желания в нужном порядке.
export const ReorderInputSchema = z.object({ ids: z.array(z.string()) });

// POST /wishlist/items/:id/given — «Мне это подарили».
export const GivenInputSchema = z.object({
  fromUserId: z.string().optional(),
  fromName: z.string().trim().max(40).optional(),
  at: z.string().min(1),
});

// POST /wishlist/items/:id/restore — { undo: true } сразу после «подарили».
export const RestoreInputSchema = z.object({ undo: z.boolean().optional() });

// Повод из запроса. Свой (старый custom) — до 60 символов, как в ссылке
// (share-codec). important — со своей датой (dateId), остальное сервер
// дополнит сам (normalizeOccasionFrom).
export const OccasionInputSchema = OccasionSchema.extend({
  label: z.string().trim().max(60, "Повод — до 60 символов").optional(),
  dateId: z.string().max(60).optional(),
}).refine((occasion) => occasion.kind !== "important" || occasion.dateId, {
  message: "Выбери дату",
});

// PATCH /wishlist/meta — повод, сообщение, «Не показывать мне даже это».
export const MetaPatchInputSchema = z.object({
  occasion: OccasionInputSchema.nullable().optional(),
  message: z.string().trim().max(200, "Сообщение — до 200 символов").optional(),
  hideReservationCount: z.boolean().optional(),
});

// Сколько удалённое желание ждёт «Отменить» (BACKEND.md §4.4, B07).
export const UNDELETE_WINDOW_MS = 10 * 60_000;
