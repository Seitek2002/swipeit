import { readFile } from "node:fs/promises";
import path from "node:path";

import type {
  Activity,
  CatalogMeta,
  Product,
} from "@/shared/api/catalog/types";
import {
  type ParsedCatalog,
  parseActivities,
  parseCatalogMeta,
  parseProducts,
} from "@/shared/api/mock-server/catalog-parse";
import type { CatalogAccess } from "@/shared/api/mock-server/context";
import { ApiError, notFound } from "@/shared/api/mock-server/errors";

type Options = {
  // Папка с products.json и activities.json — public/catalog (её наполняет
  // catalog:sync перед сборкой).
  dir: string;
  log?: (line: string) => void;
};

// Каталог в Node (TECH_SPEC §6): те же файлы и тот же разбор, что у
// браузерного адаптера, только с диска. Читается один раз в память; не
// прочитался — запрос получает OFFLINE, следующий попробует снова.
export const createFsCatalog = ({
  dir,
  log = console.warn,
}: Options): CatalogAccess => {
  const load = <T>(
    file: string,
    parse: (raw: unknown) => ParsedCatalog<T>,
    label: string,
  ) => {
    let cached: null | Promise<T[]> = null;
    return () => {
      cached ??= readFile(path.join(dir, file), "utf8")
        .then((text) => {
          const { items, dropped } = parse(JSON.parse(text) as unknown);
          if (dropped.length > 0) {
            log(`Пропущено битых ${label}: ${dropped.length} (${dropped[0]}…)`);
          }
          return items;
        })
        .catch((error: unknown) => {
          cached = null;
          if (error instanceof ApiError) throw error;
          log(`Каталог ${file} не прочитался: ${String(error)}`);
          throw new ApiError(
            503,
            "OFFLINE",
            "Каталог не загрузился. Перезапусти сервер: npm run lan",
          );
        });
      return cached;
    };
  };

  const products = load<Product>("products.json", parseProducts, "подарков");
  const activities = load<Activity>(
    "activities.json",
    parseActivities,
    "занятий",
  );
  // Авторы фото занятий (страница «Авторы фото», TECH_SPEC CatalogMeta).
  let metaCache: null | Promise<CatalogMeta> = null;
  const meta = () => {
    metaCache ??= readFile(path.join(dir, "meta.json"), "utf8")
      .then((text) => {
        const parsed = parseCatalogMeta(JSON.parse(text) as unknown);
        if (parsed.dropped.length > 0) {
          log(`Пропущено битых записей авторов фото: ${parsed.dropped.length}`);
        }
        if (!parsed.meta) throw notFound("Список авторов фото повреждён");
        return parsed.meta;
      })
      .catch((error: unknown) => {
        metaCache = null;
        if (error instanceof ApiError) throw error;
        log(`Каталог meta.json не прочитался: ${String(error)}`);
        throw new ApiError(
          503,
          "OFFLINE",
          "Каталог не загрузился. Перезапусти сервер: npm run lan",
        );
      });
    return metaCache;
  };

  return { products, activities, meta };
};
