import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { GUIDE_PRODUCT_ID } from "@/shared/config";

import type { CatalogStores, FeedResponse } from "../catalog/types";
import type { User } from "../users/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
  createRecordingRealtime,
} from "./adapters/memory";
import { parseProducts } from "./catalog-parse";
import { createSeededRandom } from "./random";
import { createSeedDb } from "./seed";
import { type MockServer, createMockServer } from "./server";

// Обучающая карточка на настоящем каталоге Товароведа (TECH_SPEC §6,
// «Алгоритм ленты», п. 2). Если товар уберут из каталога или он перестанет
// подходить, тест упадёт сразу, а не на показе: его обложка вшита в HTML.
const catalogPath = fileURLToPath(
  new URL("../../../../../catalog/products.json", import.meta.url),
);
const { items: products } = parseProducts(
  JSON.parse(readFileSync(catalogPath, "utf8")),
);

const NOW = new Date(2026, 10, 27, 12).getTime();

let server: MockServer;

const call = <T>(
  method: "GET" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
  query?: Record<string, unknown>,
) => server.handle({ method, path, userId, body, query }) as Promise<T>;

const feed = (userId: string, filters?: unknown) =>
  call<FeedResponse>("GET", "/catalog/feed", userId, undefined, {
    context: "self",
    ...(filters ? { filters: JSON.stringify(filters) } : {}),
  });

beforeEach(() => {
  const clock = createFixedClock(NOW);
  server = createMockServer({
    catalog: createMemoryCatalog(products),
    clock,
    db: createMemoryDb(async () =>
      createSeedDb({ products, now: clock.now() }),
    ),
    realtime: createRecordingRealtime(),
    random: createSeededRandom("guide"),
    settings: createMemorySettings(),
  });
});

describe("обучающая карточка в каталоге", () => {
  it(`${GUIDE_PRODUCT_ID} есть, для всех и с 2+ фото`, () => {
    const guide = products.find((p) => p.id === GUIDE_PRODUCT_ID);
    expect(guide).toBeDefined();
    expect(guide?.audience).toBe("all");
    expect(guide?.images.length).toBeGreaterThanOrEqual(2);
  });

  it("новый профиль: первая карточка — он, в первой порции 10 разных категорий", async () => {
    const user = await call<User>("POST", "/users", null, {});
    const page = await feed(user.id);
    expect(page.items[0]?.id).toBe(GUIDE_PRODUCT_ID);
    expect(new Set(page.items.map((p) => p.category)).size).toBe(10);
  });

  it("подсказка отмечена — обычная лента; «Показать обучение снова» — снова он", async () => {
    const user = await call<User>("POST", "/users", null, {});
    await call("POST", "/me/hints", user.id, { id: "deck_guide" });
    expect((await feed(user.id)).items[0]?.id).not.toBe(GUIDE_PRODUCT_ID);
    await call("POST", "/demo/hints/reset", user.id);
    expect((await feed(user.id)).items[0]?.id).toBe(GUIDE_PRODUCT_ID);
  });

  it("с фильтром «до 2 000 сом» — обычная первая карточка", async () => {
    const user = await call<User>("POST", "/users", null, {});
    const page = await feed(user.id, {
      budget: { min: 0, max: 2000 },
      categories: [],
      marketplaces: [],
    });
    expect(page.items[0]?.id).not.toBe(GUIDE_PRODUCT_ID);
    expect(page.items.length).toBeGreaterThan(0);
  });
});

describe("магазины для фильтра (UX-аудит M1)", () => {
  it("только магазины с товарами; «другие» — доменами, по убыванию числа товаров", async () => {
    const stores = await call<CatalogStores>("GET", "/catalog/stores", null);
    expect(stores.marketplaces).toEqual(["aliexpress", "wildberries"]);
    expect(stores.shops.slice(0, 3)).toEqual([
      "kivano.kg",
      "labirint.ru",
      "sulpak.kg",
    ]);
    expect(stores.marketplaces).not.toContain("other");
  });
});
