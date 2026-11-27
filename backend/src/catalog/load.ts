import type {
  Activity,
  CatalogMeta,
  Product,
} from "@swipeit/core/api/catalog/types";
import {
  parseActivities,
  parseCatalogMeta,
  parseProducts,
} from "@swipeit/core/logic/catalog-parse";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

// Каталог в памяти (BACKEND.md §8): читается при старте тем же
// catalog-parse, что у мока. Битые записи пропускаются и пишутся в лог.
export type ServerCatalog = {
  activities: readonly Activity[];
  meta: CatalogMeta | null;
  products: readonly Product[];
  productsById: ReadonlyMap<string, Product>;
  // Хэш products.json — в /v1/health: видно рассинхрон фронта и сервера.
  version: string;
};

type Log = { warn: (details: object, message: string) => void };

const readJson = async (dir: string, name: string) => {
  const raw = await readFile(path.join(dir, name), "utf8");
  return { raw, json: JSON.parse(raw) as unknown };
};

export const loadCatalog = async (
  dir: string,
  log: Log,
): Promise<ServerCatalog> => {
  const productsFile = await readJson(dir, "products.json");
  const products = parseProducts(productsFile.json);
  if (products.dropped.length > 0) {
    log.warn({ dropped: products.dropped }, "Каталог: пропущены битые подарки");
  }
  const activities = parseActivities(
    (await readJson(dir, "activities.json")).json,
  );
  if (activities.dropped.length > 0) {
    log.warn(
      { dropped: activities.dropped },
      "Каталог: пропущены битые занятия",
    );
  }
  const meta = parseCatalogMeta((await readJson(dir, "meta.json")).json);
  if (meta.dropped.length > 0) {
    log.warn(
      { dropped: meta.dropped },
      "Каталог: битые записи об авторах фото",
    );
  }
  return {
    products: products.items,
    productsById: new Map(products.items.map((item) => [item.id, item])),
    activities: activities.items,
    meta: meta.meta,
    version: createHash("sha256")
      .update(productsFile.raw)
      .digest("hex")
      .slice(0, 12),
  };
};
