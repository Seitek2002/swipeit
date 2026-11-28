import { z } from "zod";

import { ActivitySchema } from "../catalog/types";
import { PickAnswerSchema, PickRequestSchema } from "../pick/types";
import { PlanSessionSchema } from "../plans/types";
import { SantaGameSchema } from "../santa/types";
import { ImportantDateSchema, UserSchema } from "../users/types";
import {
  ExternalWishlistSchema,
  ProductSwipeSchema,
  ReservationSchema,
  WishlistItemSchema,
  WishlistMetaSchema,
} from "../wishlist/types";

// База демо (TECH_SPEC §5 «База»). Одна схема для обоих режимов: в local —
// ключ localStorage, в lan — JSON-файл на ноутбуке.
export const DB_STORAGE_KEY = "swipeit:db:v1";

export const DbSchema = z.object({
  version: z.literal(1),
  users: z.record(z.string(), UserSchema),
  // Симметрично: если A дружит с B, то и B с A.
  friends: z.record(z.string(), z.array(z.string())),
  productSwipes: z.array(ProductSwipeSchema),
  wishlistItems: z.record(z.string(), z.array(WishlistItemSchema)),
  wishlistMeta: z.record(z.string(), WishlistMetaSchema),
  reservations: z.array(ReservationSchema),
  externalWishlists: z.record(z.string(), ExternalWishlistSchema),
  // Кто какие снимки открывал (UX-аудит X03): id профиля или гостя «g_…» →
  // id снимка → когда открыл. Снимки общие на базу, а в «Локальной сети»
  // база одна на всех — «Открывал по ссылке» у каждого свой.
  openedWishlists: z
    .record(z.string(), z.record(z.string(), z.string()))
    .default({}),
  pickRequests: z.record(z.string(), PickRequestSchema),
  pickAnswers: z.array(PickAnswerSchema),
  customActivities: z.record(z.string(), ActivitySchema),
  plans: z.record(z.string(), PlanSessionSchema),
  santaGames: z.record(z.string(), SantaGameSchema),
  // ownerId → значимые даты (этап 7). default — база, сохранённая до
  // обновления, читается без сброса (TECH_SPEC §5 «Совместимость»).
  importantDates: z
    .record(z.string(), z.array(ImportantDateSchema))
    .default({}),
});

export type Db = z.infer<typeof DbSchema>;

export const createEmptyDb = (): Db => ({
  version: 1,
  users: {},
  friends: {},
  productSwipes: [],
  wishlistItems: {},
  wishlistMeta: {},
  reservations: [],
  externalWishlists: {},
  openedWishlists: {},
  pickRequests: {},
  pickAnswers: [],
  customActivities: {},
  plans: {},
  santaGames: {},
  importantDates: {},
});

// Сырой JSON из хранилища → база. null — данных нет; "broken" — JSON битый
// или не совпала схема (тогда база пересоздаётся из сида, TECH_SPEC §5).
export const parseDb = (raw: null | string): "broken" | Db | null => {
  if (raw === null || raw === "") return null;
  try {
    const result = DbSchema.safeParse(JSON.parse(raw));
    return result.success ? result.data : "broken";
  } catch {
    return "broken";
  }
};

// Перед записью — проверка: обработчик не должен сохранить базу, которую
// потом сам же не прочитает.
export const assertValidDb = (db: Db): Db => DbSchema.parse(db);
