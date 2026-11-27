import { z } from "zod";

import {
  ACTIVITY_CATEGORY_IDS,
  ACTIVITY_TAG_IDS,
  AUDIENCES,
  CATEGORY_IDS,
  MARKETPLACE_IDS,
  SEASONS,
} from "@/shared/config";

// Контракт каталога (TECH_SPEC §5, бриф Товароведа §5). Схемы zod — источник
// и для типов, и для проверки JSON при загрузке: битая запись пропускается,
// а не роняет приложение.

export const ProductImageSchema = z.object({
  src: z.string().min(1),
  alt: z.string(),
  variantOptionId: z.string().optional(),
  // Откуда скачано фото — чтобы по жалобе быстро найти и убрать (TECH_SPEC §13).
  sourceUrl: z.string().optional(),
});

export const VariantOptionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
  hex: z.string().optional(),
});

export const VariantGroupSchema = z.object({
  id: z.string().min(1),
  kind: z.enum(["color", "size", "other"]),
  label: z.string(),
  options: z.array(VariantOptionSchema).min(1),
});

export const OfferSchema = z.object({
  marketplace: z.enum(MARKETPLACE_IDS),
  url: z.string().min(1),
  price: z.number().nonnegative(),
  originalPrice: z.number().nonnegative().optional(),
  originalCurrency: z.enum(["RUB", "USD", "CNY", "KGS"]).optional(),
  checkedAt: z.string(),
});

export const ProductSchema = z
  .object({
    id: z.string().min(1),
    title: z.string().min(1),
    description: z.string(),
    category: z.enum(CATEGORY_IDS),
    // InterestId = string (TECH_SPEC §5): незнакомый интерес не делает товар
    // битым, он просто не совпадёт ни с чьими интересами.
    interests: z.array(z.string()),
    audience: z.enum(AUDIENCES),
    priceMin: z.number().nonnegative(),
    priceMax: z.number().nonnegative(),
    images: z.array(ProductImageSchema).min(1),
    variants: z.array(VariantGroupSchema).optional(),
    offers: z.array(OfferSchema).min(1),
    popularity: z.number().min(0).max(1),
  })
  .refine((product) => product.priceMin <= product.priceMax, {
    message: "priceMin больше priceMax",
  });

export const ActivitySchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  description: z.string(),
  category: z.enum(ACTIVITY_CATEGORY_IDS),
  tags: z.array(z.enum(ACTIVITY_TAG_IDS)),
  pricePerPersonMin: z.number().nonnegative(),
  pricePerPersonMax: z.number().nonnegative(),
  durationMin: z.number().nonnegative(),
  durationMax: z.number().nonnegative(),
  // Пустой массив — круглый год.
  seasons: z.array(z.enum(SEASONS)),
  groupSize: z.object({ min: z.number(), max: z.number().nullable() }),
  place: z.string().optional(),
  distanceNote: z.string().optional(),
  image: z.object({ src: z.string().min(1), alt: z.string() }).optional(),
  isCustom: z.boolean().optional(),
  createdBy: z.string().optional(),
  // Расширение TECH_SPEC §5: фото своего занятия — ключ в IndexedDB (local)
  // или на LAN-сервере (lan), как у своего желания (CustomWish.imageKey).
  imageKey: z.string().optional(),
});

// public/catalog/meta.json (TECH_SPEC §5): курсы валют и авторы фото
// занятий. Фото с Wikimedia Commons под CC BY / CC BY-SA без автора
// показывать нельзя — отсюда страница «Авторы фото».
export const PhotoCreditSchema = z.object({
  activityId: z.string().min(1),
  author: z.string().min(1),
  // Страница файла на Wikimedia Commons.
  url: z.string().min(1),
  // «CC BY-SA 4.0», «CC0», «Public domain».
  license: z.string().min(1),
  // Нет у CC0 и Public domain.
  licenseUrl: z.string().optional(),
  source: z.string(),
  file: z.string().optional(),
});

export const CatalogRatesSchema = z.object({
  source: z.string(),
  date: z.string(),
  RUB: z.number(),
  USD: z.number(),
  CNY: z.number(),
});

export const CatalogMetaSchema = z.object({
  collectedAt: z.string(),
  rates: CatalogRatesSchema,
  activityPhotoCredits: z.array(PhotoCreditSchema),
});

// Фильтры ленты и ссылки «Выбери подарок сам». max = null — без верхней границы.
export const ProductFiltersSchema = z.object({
  budget: z.object({
    min: z.number().nonnegative(),
    max: z.number().nullable(),
  }),
  categories: z.array(z.enum(CATEGORY_IDS)),
  marketplaces: z.array(z.enum(MARKETPLACE_IDS)),
  // «Показывать подарки: всем / для неё / для него» — в фильтрах и в
  // профиле (один стор gift-filters), едет и в ссылку-фильтр. Нет поля —
  // «всем»: старые ссылки и сохранённые фильтры читаются как раньше.
  audience: z.enum(AUDIENCES).optional(),
});

export type ProductImage = z.infer<typeof ProductImageSchema>;
export type VariantOption = z.infer<typeof VariantOptionSchema>;
export type VariantGroup = z.infer<typeof VariantGroupSchema>;
export type Offer = z.infer<typeof OfferSchema>;
export type Product = z.infer<typeof ProductSchema>;
export type Activity = z.infer<typeof ActivitySchema>;
export type PhotoCredit = z.infer<typeof PhotoCreditSchema>;
export type CatalogMeta = z.infer<typeof CatalogMetaSchema>;
export type ProductFilters = z.infer<typeof ProductFiltersSchema>;

// Ответ ленты: порция карточек и сколько всего осталось в этих фильтрах.
export type FeedResponse = { items: Product[]; total: number };
