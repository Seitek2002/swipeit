import { z } from "zod";

import {
  AVATAR_COLORS,
  type AvatarColor,
  IMPORTANT_DATE_PRESETS,
  OCCASION_KINDS,
} from "../../config/index";

export const SwipeDecisionSchema = z.enum(["like", "superlike", "pass"]);

export const SwipeContextSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("self") }),
  z.object({ kind: z.literal("pick"), requestId: z.string() }),
]);

// POST /swipes — решение по карточке. Вариант из шторки «Подробнее» («мне —
// чёрный, M») уходит в вишлист. Общая для мока и сервера (BACKEND.md B06).
export const SwipeInputSchema = z.object({
  productId: z.string().min(1),
  decision: SwipeDecisionSchema,
  context: SwipeContextSchema,
  variantChoice: z.record(z.string(), z.string()).optional(),
});

// POST /swipes/undo и /swipes/restart.
export const SwipeContextInputSchema = z.object({
  context: SwipeContextSchema,
});

export const ProductSwipeSchema = z.object({
  id: z.string(),
  userId: z.string(),
  productId: z.string(),
  decision: SwipeDecisionSchema,
  context: SwipeContextSchema,
  // Вариант, выбранный в «Подробнее». Нужен ответу «Выбери подарок сам»:
  // там выбор не попадает в вишлист, а хранится только в свайпе.
  variantChoice: z.record(z.string(), z.string()).optional(),
  at: z.string(),
});

export const CustomWishSchema = z.object({
  title: z.string().min(1),
  priceMin: z.number().nonnegative().optional(),
  priceMax: z.number().nonnegative().optional(),
  url: z.string().optional(),
  // Ключ фото в IndexedDB (local) или на LAN-сервере (lan).
  imageKey: z.string().optional(),
});

export const WishlistItemSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  source: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("product"), productId: z.string() }),
    z.object({ kind: z.literal("custom"), custom: CustomWishSchema }),
  ]),
  // top = «Очень хочу».
  priority: z.enum(["normal", "top"]),
  order: z.number(),
  variantChoice: z.record(z.string(), z.string()).optional(),
  note: z.string().max(140).optional(),
  status: z.enum(["active", "given"]),
  given: z
    .object({
      fromUserId: z.string().optional(),
      fromName: z.string().optional(),
      at: z.string(),
    })
    .optional(),
  addedAt: z.string(),
});

// Повод вишлиста (TECH_SPEC §5 WishlistMeta.occasion). "custom" — только
// старые данные и ссылки; "important" — значимая дата владельца.
export const OccasionSchema = z.object({
  kind: z.enum(OCCASION_KINDS),
  // Для "important": ImportantDate.id. Только у владельца — в ссылку и
  // чужим не отдаётся.
  dateId: z.string().optional(),
  // Готовый повод значимой даты: по нему гость видит «на годовщину».
  preset: z.enum(IMPORTANT_DATE_PRESETS).optional(),
  // Только у старого "custom".
  label: z.string().optional(),
  // "YYYY-MM-DD" ближайшего наступления.
  date: z.string().optional(),
});

export const WishlistMetaSchema = z.object({
  ownerId: z.string(),
  occasion: OccasionSchema.optional(),
  message: z.string().max(200).optional(),
  hideReservationCount: z.boolean(),
  // Ставится на 5-м «Хочу» и больше не снимается (решение владельца).
  shareUnlockedAt: z.string().optional(),
  dismissedGivenHintFor: z.string().optional(),
});

export const ReservationSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  // productId или "custom:<title>" — стабильно между устройствами.
  itemKey: z.string(),
  reserver: z.object({ userId: z.string().optional(), name: z.string() }),
  at: z.string(),
  closedAt: z.string().optional(),
});

export const ExternalWishlistSchema = z.object({
  id: z.string(),
  owner: z.object({
    name: z.string(),
    avatarColor: z.enum(AVATAR_COLORS),
    userId: z.string().optional(),
  }),
  meta: z.object({
    occasion: OccasionSchema.optional(),
    message: z.string().optional(),
    shareUnlockedAt: z.string().optional(),
    dismissedGivenHintFor: z.string().optional(),
  }),
  items: z.array(
    z.object({
      key: z.string(),
      productId: z.string().optional(),
      // imageKey — только в гостевом виде с сервера (живая короткая ссылка,
      // BACKEND.md §6.2): фото своего желания. В длинной ссылке фото нет.
      custom: CustomWishSchema.optional(),
      priority: z.enum(["normal", "top"]),
      variantChoice: z.record(z.string(), z.string()).optional(),
      note: z.string().optional(),
    }),
  ),
  openedAt: z.string(),
});

export type SwipeDecision = z.infer<typeof SwipeDecisionSchema>;
export type SwipeContext = z.infer<typeof SwipeContextSchema>;
export type ProductSwipe = z.infer<typeof ProductSwipeSchema>;
export type CustomWish = z.infer<typeof CustomWishSchema>;
export type WishlistItem = z.infer<typeof WishlistItemSchema>;
export type Occasion = z.infer<typeof OccasionSchema>;
export type WishlistMeta = z.infer<typeof WishlistMetaSchema>;
export type Reservation = z.infer<typeof ReservationSchema>;
export type ExternalWishlist = z.infer<typeof ExternalWishlistSchema>;

// Ответ на свайп: сколько желаний в «Хочу» (свои тоже) и открылся ли шеринг
// прямо сейчас (по shareJustUnlocked клиент запускает бант, TECH_SPEC §6
// «Порог отправки»).
// tasteJustFormed — впервые вывелись 2 интереса, а тост «Подстроили ленту
// под твои „Хочу“» ещё не показывали (TECH_SPEC §6 «Вкус»).
export type SwipeResponse = {
  shareJustUnlocked: boolean;
  shareUnlocked: boolean;
  tasteJustFormed: boolean;
  wishCount: number;
  wishlistItemId?: string;
};

export type WishlistResponse = {
  // Подсказка после повода: забронированные желания (DESIGN.md §8.3, P1).
  givenHintIds: string[];
  items: WishlistItem[];
  meta: WishlistMeta;
  // null — владелец скрыл счётчик («Не показывать мне даже это»).
  reservationCount: null | number;
  // Желаний в «Хочу» — для «Ещё N желаний — и можно отправить».
  wishCount: number;
};

// Вишлист глазами гостя: по ссылке (снимок) или друга из списка (T11).
export type GuestWishlist = Pick<ExternalWishlist, "items" | "meta" | "owner">;

// Брони: владельцу — только количество (сюрприз), гостю — что занято.
export type ReservationsView =
  | { count: number; role: "owner" }
  | {
      items: Array<{
        closed: boolean;
        id: string;
        itemKey: string;
        mine: boolean;
      }>;
      role: "guest";
    };

// GET /me/reservations — «Я дарю»: свои брони (auto-tasks P02). Чужих
// бронирующих здесь нет; повод — как его видят гости (occasionForOthers).
export type MyReservation = {
  at: string;
  closed: boolean;
  // Когда бронь закрылась («Мне это подарили»): по нему закрытые уходят,
  // если у повода нет даты.
  closedAt?: string;
  id: string;
  item: {
    custom?: Omit<CustomWish, "imageKey">;
    productId?: string;
  };
  itemKey: string;
  occasion?: Occasion;
  owner: { avatarColor: AvatarColor; id: string; name: string };
};
