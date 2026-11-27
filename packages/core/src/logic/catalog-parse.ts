import { z } from "zod";

import {
  type Activity,
  ActivitySchema,
  type CatalogMeta,
  CatalogMetaSchema,
  type PhotoCredit,
  PhotoCreditSchema,
  type Product,
  ProductSchema,
} from "../api/catalog/types";

export type ParsedCatalog<T> = { dropped: string[]; items: T[] };

// Каталог приходит от Товароведа (TECH_SPEC §6): каждая запись проверяется
// отдельно, битая пропускается — одна кривая карточка не должна ронять ленту.
const parseList = <T>(
  raw: unknown,
  schema: z.ZodType<T>,
  label: string,
  // Поле, по которому ищем повторы: у товаров и занятий — id, у авторов
  // фото — activityId (одно фото на занятие).
  idField = "id",
): ParsedCatalog<T> => {
  if (!Array.isArray(raw))
    return { items: [], dropped: [`${label}: не массив`] };
  const items: T[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const result = schema.safeParse(entry);
    const id =
      typeof entry === "object" && entry !== null && idField in entry
        ? String((entry as Record<string, unknown>)[idField])
        : `#${index}`;
    if (!result.success) {
      const issue = result.error.issues[0];
      dropped.push(
        `${id}: ${issue?.path.join(".") || "запись"} — ${issue?.message ?? "не по схеме"}`,
      );
      return;
    }
    if (seen.has(id)) {
      dropped.push(`${id}: повтор id`);
      return;
    }
    seen.add(id);
    items.push(result.data);
  });
  return { items, dropped };
};

export const parseProducts = (raw: unknown): ParsedCatalog<Product> =>
  parseList(raw, ProductSchema, "products.json");

export const parseActivities = (raw: unknown): ParsedCatalog<Activity> =>
  parseList(raw, ActivitySchema, "activities.json");

// meta.json: шапка (дата сбора, курсы) обязательна — без неё файл битый
// целиком (meta: null); авторы фото проверяются по одному, как карточки.
const MetaHeadSchema = CatalogMetaSchema.extend({
  activityPhotoCredits: z.array(z.unknown()),
});

export const parseCatalogMeta = (
  raw: unknown,
): { dropped: string[]; meta: CatalogMeta | null } => {
  const head = MetaHeadSchema.safeParse(raw);
  if (!head.success) {
    const issue = head.error.issues[0];
    return {
      meta: null,
      dropped: [
        `meta.json: ${issue?.path.join(".") || "файл"} — ${issue?.message ?? "не по схеме"}`,
      ],
    };
  }
  const credits = parseList<PhotoCredit>(
    head.data.activityPhotoCredits,
    PhotoCreditSchema,
    "meta.json",
    "activityId",
  );
  return {
    meta: { ...head.data, activityPhotoCredits: credits.items },
    dropped: credits.dropped,
  };
};
