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
  // requestId — в уникальном индексе свайпов: длина ограничена (ревью R8).
  z.object({ kind: z.literal("pick"), requestId: z.string().min(1).max(60) }),
]);

// id вишлиста в теле или query запроса: «wl_» + nanoid(10) у новых. Свой ли
// он — проверяет обработчик (чужой — NOT_FOUND «Вишлист не найден»).
export const WishlistIdSchema = z
  .string({ error: "Выбери вишлист" })
  .min(1, "Выбери вишлист")
  .max(40, "Вишлист не найден");

// POST /swipes — решение по карточке. Вариант из шторки «Подробнее» («мне —
// чёрный, M») уходит в вишлист. Общая для мока и сервера (BACKEND.md B06).
// wishlistId — «Хочу» в этот вишлист из меню карточки (spec §2.3, §4.4):
// главный не меняется. Без него — в главный. Только в своей ленте: свайпы
// «Выбери подарок сам» в вишлист не попадают.
export const SwipeInputSchema = z
  .object({
    productId: z.string().min(1),
    decision: SwipeDecisionSchema,
    context: SwipeContextSchema,
    variantChoice: z
      .record(z.string().max(40), z.string().max(60))
      .refine((choice) => Object.keys(choice).length <= 10, {
        message: "Слишком много вариантов",
      })
      .optional(),
    wishlistId: WishlistIdSchema.optional(),
  })
  .refine((input) => !input.wishlistId || input.context.kind === "self", {
    message: "Вишлист выбирают только в своей ленте",
    path: ["wishlistId"],
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
  // Куда легло «Хочу» (product_swipes.wishlist_id): оттуда его убирают
  // «Вернуть» и «Мимо». Нет — из главного (spec §3.4).
  wishlistId: z.string().optional(),
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
  // Вишлист, в котором лежит строка (несколько вишлистов, spec L01 §2.4).
  // Необязательно, пока мок и сервер его не пишут (L04, L05), и для старых
  // данных мока: без него желание — в «Общем» (normalizeWishlists, §3.6).
  wishlistId: z.string().optional(),
  // Копия своего желания: id исходного желания (у копии копии — тоже
  // исходного). По нему ключ брони один на все копии (itemKeyOf, §2.4).
  originId: z.string().optional(),
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

// Вишлист человека (spec §2.1): «Общий» (isDefault) есть у каждого с
// профилем, остальные человек создаёт сам. Повод, сообщение и подсказка
// «Возможно, тебе подарили это» — у каждого вишлиста свои.
export const WishlistSchema = z.object({
  id: z.string(),
  ownerId: z.string(),
  name: z.string().min(1).max(40),
  isDefault: z.boolean(),
  occasion: OccasionSchema.optional(),
  message: z.string().max(200).optional(),
  dismissedGivenHintFor: z.string().optional(),
  createdAt: z.string(),
});

// Настройки человека. occasion, message и dismissedGivenHintFor здесь — для
// старых данных и прежних экранов: в ответе GET /wishlist их берут из
// открытого вишлиста (spec §3.1), а hideReservationCount и shareUnlockedAt
// остаются у человека (§2.1).
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
    // Название отправленного вишлиста — только если его стоит показывать
    // (showListName): у «Общего» его нет (spec §3.7, §4.7).
    listName: z.string().max(40).optional(),
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
  // Путь, по которому снимок открывают снова (UX-аудит X03): «/w/?d=…» в
  // демо, короткая ссылка на сервере. Адрес сайта и basePath добавляет
  // клиент. У снимков, сохранённых до X03, пути нет.
  link: z.string().optional(),
});

export type SwipeDecision = z.infer<typeof SwipeDecisionSchema>;
export type SwipeContext = z.infer<typeof SwipeContextSchema>;
export type ProductSwipe = z.infer<typeof ProductSwipeSchema>;
export type CustomWish = z.infer<typeof CustomWishSchema>;
export type WishlistItem = z.infer<typeof WishlistItemSchema>;
export type Occasion = z.infer<typeof OccasionSchema>;
export type Wishlist = z.infer<typeof WishlistSchema>;
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
  // Куда легло «Хочу»: в главный или в вишлист из меню карточки.
  wishlistId?: string;
  wishlistItemId?: string;
};

export type WishlistResponse = {
  // Подсказка после повода: забронированные желания (DESIGN.md §8.3, P1).
  givenHintIds: string[];
  items: WishlistItem[];
  meta: WishlistMeta;
  // null — владелец скрыл счётчик («Не показывать мне даже это»).
  reservationCount: null | number;
  // Разных подарков в «Хочу» во всех вишлистах человека (копия не в счёт,
  // distinctWishCount) — для «Ещё N желаний — и можно отправить» и бейджа.
  wishCount: number;
  // Открытый вишлист (?list=, без него — главный). meta.occasion, message и
  // dismissedGivenHintFor — из него. Необязательно, пока мок и сервер его не
  // отдают (L04); дальше есть всегда, и при выключенном флаге тоже («Общий»).
  wishlist?: Wishlist;
};

// GET /wishlists — ряд вишлистов владельца (spec §3.1, §4.1): «Общий»
// первым, дальше по созданию.
export type WishlistSummary = Pick<
  Wishlist,
  "id" | "isDefault" | "name" | "occasion"
> & {
  // «Хочу» в этом вишлисте.
  activeCount: number;
  // До 4 фото сверху списка (wishlistCover).
  cover: WishlistCover[];
  givenCount: number;
  // Есть живая ссылка — когда создана.
  sharedAt?: string;
};

export type WishlistCover = { imageKey?: string; productId?: string };

export type WishlistsResponse = {
  // Главный: сюда летят «Хочу» из ленты (resolveActiveWishlistId).
  activeId: string;
  lists: WishlistSummary[];
};

// Чужие вишлисты: GET /users/:id/wishlists — только непустые (§2.10). Какой
// вишлист главный, друг не видит.
export type FriendWishlistSummary = Pick<
  WishlistSummary,
  "activeCount" | "id" | "name"
> & {
  isDefault: boolean;
  // Как его видят гости (occasionForOthers).
  occasion?: Occasion;
};

export type FriendWishlistsResponse = {
  lists: FriendWishlistSummary[];
  // Какой открыть первым (pickFriendWishlist): тот же, что отдаёт
  // GET /users/:id/wishlist без ?list.
  openId: null | string;
};

// POST /wishlist/items/:id/move. from — откуда ушло, для «Отменить» (move с
// order). merged — в цели подарок уже был, строки слиты (mergeOnMove), item —
// строка цели; отменить слияние нельзя.
export type MoveItemResponse = {
  from: { order: number; wishlistId: string };
  item: WishlistItem;
  merged: boolean;
};

// POST /wishlist/items/:id/copy. alreadyThere — подарок уже был в цели:
// ничего не меняли, item — та строка.
export type CopyItemResponse = { alreadyThere: boolean; item: WishlistItem };

// DELETE /wishlists/:id — сколько желаний переехало в «Общий» (§2.7).
export type DeleteWishlistResponse = { movedCount: number };

// Вишлист глазами гостя: по ссылке (снимок) или друга из списка (T11).
// list — какой вишлист (несколько вишлистов, §4.7): название показываем,
// только если showName (у «Общего» — нет). Нет поля — старый ответ.
export type GuestWishlist = Pick<
  ExternalWishlist,
  "items" | "meta" | "owner"
> & {
  list?: { id: string; name: string; showName: boolean };
};

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
  // Бронь по ссылке, а не у друга из списка (X03): у строки подпись «по
  // ссылке» — человек по ссылке и демо-друг с тем же именем не сливаются.
  byLink?: boolean;
  occasion?: Occasion;
  owner: { avatarColor: AvatarColor; id: string; name: string };
  // Куда вернуться к вишлисту по ссылке (X03): путь снимка, в котором есть
  // это желание. Нет — у друга из списка ведёт его профиль, у старой
  // ссылки без пути — никуда.
  wishlistUrl?: string;
};

// GET /me/opened-wishlists — «Открывал по ссылке» на «Друзьях» (X03): чьи
// вишлисты человек открывал по ссылке. По одному на владельца, свежие
// сверху; друзей из списка и свой вишлист здесь нет.
export type OpenedWishlist = {
  // id снимка (ew_…).
  id: string;
  occasion?: Occasion;
  openedAt: string;
  owner: Pick<ExternalWishlist["owner"], "avatarColor" | "name" | "userId">;
  url: string;
  // Название вишлиста для «Вишлист Даны — День рождения» (spec §3.5): только
  // если его стоит показывать (showListName).
  listName?: string;
  // Вишлист удалили — строка ведёт на «Этот вишлист удалили».
  deleted?: boolean;
};
