import { getTransport } from "../transport";
import type {
  CatalogMeta,
  CatalogStores,
  FeedResponse,
  Product,
  ProductFilters,
} from "./types";

type FeedParams = {
  // "self" или "pick:<requestId>".
  context: string;
  // id карточек, которые уже лежат в колоде, но ещё не свайпнуты.
  exclude?: string[];
  filters: ProductFilters;
  limit?: number;
};

export const getFeed = ({
  filters,
  context,
  limit,
  exclude,
}: FeedParams): Promise<FeedResponse> =>
  getTransport().request<FeedResponse>("GET", "/catalog/feed", undefined, {
    filters: JSON.stringify(filters),
    context,
    limit,
    exclude: exclude?.length ? exclude.join(",") : undefined,
  });

export const getCatalogCount = ({
  filters,
  context,
}: Pick<FeedParams, "context" | "filters">): Promise<{ count: number }> =>
  getTransport().request<{ count: number }>(
    "GET",
    "/catalog/count",
    undefined,
    {
      filters: JSON.stringify(filters),
      context,
    },
  );

export const getProduct = (id: string): Promise<Product> =>
  getTransport().request<Product>(
    "GET",
    `/catalog/products/${encodeURIComponent(id)}`,
  );

// Курсы и авторы фото занятий — для страницы «Авторы фото» (/credits/).
export const getCatalogMeta = (): Promise<CatalogMeta> =>
  getTransport().request<CatalogMeta>("GET", "/catalog/meta");

// Магазины, где в каталоге есть товары, — чипы «Магазины» в фильтрах.
export const getCatalogStores = (): Promise<CatalogStores> =>
  getTransport().request<CatalogStores>("GET", "/catalog/stores");
