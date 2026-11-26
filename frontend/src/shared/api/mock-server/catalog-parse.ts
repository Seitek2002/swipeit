import type { z } from "zod";

import {
  type Activity,
  ActivitySchema,
  type Product,
  ProductSchema,
} from "../catalog/types";

export type ParsedCatalog<T> = { dropped: string[]; items: T[] };

// Каталог приходит от Товароведа (TECH_SPEC §6): каждая запись проверяется
// отдельно, битая пропускается — одна кривая карточка не должна ронять ленту.
const parseList = <T>(
  raw: unknown,
  schema: z.ZodType<T>,
  label: string,
): ParsedCatalog<T> => {
  if (!Array.isArray(raw))
    return { items: [], dropped: [`${label}: не массив`] };
  const items: T[] = [];
  const dropped: string[] = [];
  const seen = new Set<string>();
  raw.forEach((entry, index) => {
    const result = schema.safeParse(entry);
    const id =
      typeof entry === "object" && entry !== null && "id" in entry
        ? String((entry as { id: unknown }).id)
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
