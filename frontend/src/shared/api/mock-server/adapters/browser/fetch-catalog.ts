import { withBasePath } from "@/shared/lib/base-path";

import type { Activity, CatalogMeta, Product } from "../../../catalog/types";
import {
  parseActivities,
  parseCatalogMeta,
  parseProducts,
} from "../../catalog-parse";
import type { CatalogAccess } from "../../context";
import { ApiError, isApiError, notFound } from "../../errors";

const loadJson = async (path: string): Promise<unknown> => {
  const response = await fetch(withBasePath(path));
  if (!response.ok) throw new Error(`${path}: ${response.status}`);
  return response.json();
};

// Каталог грузится один раз в память (TECH_SPEC §6): fetch из public/catalog
// с учётом basePath (GitHub Pages). Не загрузился — запрос падает с OFFLINE,
// а следующий попробует снова.
export const createFetchCatalog = (): CatalogAccess => {
  let products: null | Promise<Product[]> = null;
  let activities: null | Promise<Activity[]> = null;
  let meta: null | Promise<CatalogMeta> = null;

  const fail = (error: unknown): never => {
    console.warn("swipeit: каталог не загрузился", error);
    throw new ApiError(
      503,
      "OFFLINE",
      "Каталог не загрузился. Проверь интернет",
    );
  };

  return {
    products: () => {
      products ??= loadJson("/catalog/products.json")
        .then((raw) => {
          const { items, dropped } = parseProducts(raw);
          if (dropped.length > 0) {
            console.warn(
              `swipeit: пропущено битых подарков: ${dropped.length}`,
              dropped,
            );
          }
          return items;
        })
        .catch((error) => {
          products = null;
          return fail(error);
        });
      return products;
    },
    activities: () => {
      activities ??= loadJson("/catalog/activities.json")
        .then((raw) => {
          const { items, dropped } = parseActivities(raw);
          if (dropped.length > 0) {
            console.warn(
              `swipeit: пропущено битых занятий: ${dropped.length}`,
              dropped,
            );
          }
          return items;
        })
        .catch((error) => {
          activities = null;
          return fail(error);
        });
      return activities;
    },
    meta: () => {
      meta ??= loadJson("/catalog/meta.json")
        .then((raw) => {
          const parsed = parseCatalogMeta(raw);
          if (parsed.dropped.length > 0) {
            console.warn(
              `swipeit: пропущено битых записей об авторах фото: ${parsed.dropped.length}`,
              parsed.dropped,
            );
          }
          // Шапка файла битая — это не «нет сети», а ошибка каталога.
          if (!parsed.meta) throw notFound("Список авторов фото повреждён");
          return parsed.meta;
        })
        .catch((error: unknown) => {
          meta = null;
          if (isApiError(error)) throw error;
          return fail(error);
        });
      return meta;
    },
  };
};
