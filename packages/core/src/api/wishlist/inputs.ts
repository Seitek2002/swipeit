import { z } from "zod";

import { WISHLIST_NAME_MAX } from "../../logic/wishlists";
import { CustomWishSchema, OccasionSchema, WishlistIdSchema } from "./types";

// Вариант из «Подробнее» («Цвет: чёрный, Размер: M»): ключей немного,
// строки короткие (ревью R8) — у каталога вариантов не больше пары групп.
export const VariantChoiceInputSchema = z
  .record(z.string().max(40), z.string().max(60))
  .refine((choice) => Object.keys(choice).length <= 10, {
    message: "Слишком много вариантов",
  });

// Тела запросов своего вишлиста — общие для мока и сервера (BACKEND.md B07).

// POST /wishlist/items — своё желание: название, цена, ссылка, фото.
export const CustomWishInputSchema = CustomWishSchema.extend({
  title: z.string().trim().min(1, "Напиши, что хочешь").max(80),
  // Длиннее ссылка не влезет в ссылку на вишлист (share-codec). Только
  // http(s): ссылка уходит друзьям, «javascript:» и прочее — нет (ревью R7).
  url: z
    .string()
    .trim()
    .max(500, "Ссылка слишком длинная")
    .refine((url) => /^https?:\/\//i.test(url), {
      message: "Проверь ссылку: она начинается с https://",
    })
    .optional(),
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
  variantChoice: VariantChoiceInputSchema.optional(),
  // Пустая строка — убрать заметку.
  note: z.string().max(140, "Заметка — до 140 символов").optional(),
});

// Какой вишлист (несколько вишлистов, spec §3.2): без wishlistId — главный.
// Тело POST /wishlist/items (своё желание — рядом с CustomWishInputSchema:
// поле не уходит в custom), POST /wishlist/given-hint/dismiss.
export const WishlistTargetInputSchema = z.object({
  wishlistId: WishlistIdSchema.optional(),
});

// GET /wishlist?list=, GET /users/:id/wishlist?list= — без list у себя
// главный, у друга — pickFriendWishlist.
export const WishlistQueryInputSchema = z.object({
  list: WishlistIdSchema.optional(),
});

// POST /wishlist/reorder { ids, wishlistId? } — все желания этого вишлиста в
// нужном порядке. Без wishlistId — главный.
export const ReorderInputSchema = z.object({
  ids: z.array(z.string()),
  wishlistId: WishlistIdSchema.optional(),
});

// POST /wishlist/items/:id/given — «Мне это подарили».
export const GivenInputSchema = z.object({
  fromUserId: z.string().optional(),
  fromName: z.string().trim().max(40).optional(),
  // Дата вручения — ISO-строка (ревью R8: без формата и длины принималось
  // что угодно).
  at: z
    .string()
    .min(1)
    .max(40)
    .refine((value) => !Number.isNaN(Date.parse(value)), {
      message: "Неверная дата",
    }),
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
// Повод и сообщение — вишлиста wishlistId (без него — главного),
// hideReservationCount — человека (spec §2.1).
export const MetaPatchInputSchema = z.object({
  occasion: OccasionInputSchema.nullable().optional(),
  message: z.string().trim().max(200, "Сообщение — до 200 символов").optional(),
  hideReservationCount: z.boolean().optional(),
  wishlistId: WishlistIdSchema.optional(),
});

// ── Несколько вишлистов (spec §3.1) ───────────────────────────────────────

// Название вишлиста: 1–40 символов после trim. Уникально у человека без
// учёта регистра — это проверяет обработчик (findWishlistNameClash).
export const WishlistNameSchema = z
  .string({ error: "Назови вишлист" })
  .trim()
  .min(1, "Назови вишлист")
  .max(WISHLIST_NAME_MAX, `Название — до ${WISHLIST_NAME_MAX} символов`);

// POST /wishlists. makeActive — сразу сделать главным: с экрана вишлиста и
// из плашки над колодой — да, из меню карточки и «Переместить /
// Скопировать» — нет (решение владельца В7).
export const CreateWishlistInputSchema = z.object({
  name: WishlistNameSchema,
  occasion: OccasionInputSchema.optional(),
  makeActive: z.boolean().optional(),
});

// PATCH /wishlists/:id — переименовать («Общий» тоже можно).
export const PatchWishlistInputSchema = z.object({
  name: WishlistNameSchema.optional(),
});

// POST /wishlist/items/:id/move. order — только для «Отменить»: вернуть на
// прежнее место (как undelete). Без него — наверх вишлиста.
export const MoveItemInputSchema = z.object({
  wishlistId: WishlistIdSchema,
  order: z.number().finite().optional(),
});

// POST /wishlist/items/:id/copy — копия встаёт наверх вишлиста.
export const CopyItemInputSchema = z.object({ wishlistId: WishlistIdSchema });

// POST /wishlist/share — какой вишлист отправляем. Без wishlistId —
// VALIDATION: клиент всегда знает, что отправляет (spec §3.2). Мок и сервер
// разбирают тело этой схемой с L06; до того отправляют «Общий».
export const ShareWishlistInputSchema = z.object({
  wishlistId: WishlistIdSchema,
});

// Сколько удалённое желание ждёт «Отменить» (BACKEND.md §4.4, B07).
export const UNDELETE_WINDOW_MS = 10 * 60_000;

// ── Ссылки и брони (BACKEND.md B08) ──────────────────────────────────────

// id гостя мока и LAN — всегда «g_…»: так его нельзя выдать за id
// пользователя («u_…»). Сервер guestId не принимает: у каждой брони — автор
// с токеном (§3.1).
export const GuestIdSchema = z
  .string()
  .regex(/^g_[A-Za-z0-9_-]+$/, "Неверный id гостя");

// Код короткой ссылки (§6.2): 10 символов [A-Za-z0-9].
export const ShareCodeSchema = z
  .string()
  .regex(/^[A-Za-z0-9]{10}$/, "Ссылка больше не работает");

// GET /reservations?ownerId&share? — share: код короткой ссылки, по
// которому гость открыл вишлист (доступ без дружбы, §4.4).
export const ReservationsQueryInputSchema = z.object({
  ownerId: z.string().min(1),
  guestId: GuestIdSchema.optional(),
  share: z.string().max(20).optional(),
});

// POST /reservations — «Забронирую я». Имя нужно только безымянному: у
// профиля с именем оно берётся из него самого.
export const ReserveInputSchema = z.object({
  ownerId: z.string().min(1),
  itemKey: z.string().min(1),
  name: z.string().trim().max(40, "Имя — до 40 символов").optional(),
  guestId: GuestIdSchema.optional(),
  share: z.string().max(20).optional(),
});

// DELETE /reservations/:id?guestId — снять свою бронь.
export const ReservationDeleteQuerySchema = z.object({
  guestId: GuestIdSchema.optional(),
});

// POST /external-wishlists — снимок из старой длинной ссылки. guestId —
// гость без профиля: кто открыл, для «Открывал по ссылке» (X03); профиль
// мок узнаёт сам, сервер guestId не принимает.
export const ExternalWishlistInputSchema = z.object({
  encoded: z.string().min(1),
  guestId: GuestIdSchema.optional(),
});

// POST /share-links — короткая ссылка на план или игру (§6.2).
export const ShareLinkInputSchema = z.object({
  kind: z.enum(["plan", "santa"]),
  targetId: z.string().min(1).max(60),
});
