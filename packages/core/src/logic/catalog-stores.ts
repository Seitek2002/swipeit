import type { CatalogStores, Product } from "../api/catalog/types";
import { shopHost } from "../config/index";

// GET /catalog/stores — магазины, где есть товары (UX-аудит M1): чипы
// фильтра. Маркетплейсы — по своему id, «другие» — доменами; по убыванию
// числа товаров. Общая для мока и сервера (BACKEND.md B06).
export const catalogStores = (products: readonly Product[]): CatalogStores => {
  const marketplaces = new Map<string, number>();
  const shops = new Map<string, number>();
  for (const product of products) {
    const seen = new Set<string>();
    for (const offer of product.offers) {
      const host = offer.marketplace === "other" ? shopHost(offer.url) : null;
      const key = host ? `shop:${host}` : offer.marketplace;
      if (seen.has(key) || key === "other") continue;
      seen.add(key);
      const bucket = host ? shops : marketplaces;
      const id = host ?? offer.marketplace;
      bucket.set(id, (bucket.get(id) ?? 0) + 1);
    }
  }
  const byCount = (map: Map<string, number>) =>
    [...map.entries()]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([id]) => id);
  return {
    marketplaces: byCount(marketplaces) as CatalogStores["marketplaces"],
    shops: byCount(shops),
  };
};
