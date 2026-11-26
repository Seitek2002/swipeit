import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { FeedResponse, Product } from "../catalog/types";
import type { FriendSummary, User } from "../users/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
  createRecordingRealtime,
} from "./adapters/memory";
import { parseProducts } from "./catalog-parse";
import { createSeededRandom } from "./random";
import { DEMO_USER_ID, createSeedDb } from "./seed";
import { type MockServer, createMockServer } from "./server";

// Обработчики мок-сервера в окружении node, с базой в памяти — без
// браузера (критерий T04: изоморфность). Каталог — заглушка catalog-stub.
const stubPath = fileURLToPath(
  new URL("../../../../catalog-stub/products.json", import.meta.url),
);
const { items: products } = parseProducts(
  JSON.parse(readFileSync(stubPath, "utf8")),
);

// 26.11.2026 12:00 — фиксированные часы демо.
const NOW = new Date(2026, 10, 26, 12).getTime();

let server: MockServer;
let realtime: ReturnType<typeof createRecordingRealtime>;
let db: ReturnType<typeof createMemoryDb>;

const call = <T>(
  method: "GET" | "PATCH" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
  query?: Record<string, unknown>,
) => server.handle({ method, path, userId, body, query }) as Promise<T>;

const newUser = (overrides: Partial<User> = {}) =>
  call<User>("POST", "/users", null, {
    name: "Тест",
    avatarColor: "mint",
    interests: ["gadgets", "music", "coffee"],
    audience: "all",
    ...overrides,
  });

beforeEach(() => {
  const catalog = createMemoryCatalog(products);
  const clock = createFixedClock(NOW);
  realtime = createRecordingRealtime();
  db = createMemoryDb(async () => createSeedDb({ products, now: clock.now() }));
  server = createMockServer({
    catalog,
    clock,
    db,
    realtime,
    random: createSeededRandom("test"),
    settings: createMemorySettings(),
  });
});

describe("каталог-заглушка", () => {
  it("24 товара проходят схему без потерь", () => {
    expect(products).toHaveLength(24);
  });
});

describe("пользователи и друзья", () => {
  it("POST /users создаёт профиль и добавляет 8 демо-друзей", async () => {
    const user = await newUser();
    expect(user.id).toMatch(/^u_/);
    expect(user.isBot).toBe(false);
    const me = await call<User>("GET", "/me", user.id);
    expect(me.name).toBe("Тест");
    const friends = await call<FriendSummary[]>("GET", "/friends", user.id);
    expect(friends).toHaveLength(8);
    expect(realtime.events.some((e) => e.type === "db:changed")).toBe(true);
  });

  it("друзья: ближайшие дни рождения сверху, двое — в ближайшие 2 недели", async () => {
    const user = await newUser();
    const friends = await call<FriendSummary[]>("GET", "/friends", user.id);
    const days = friends.map((f) => f.daysToBirthday);
    expect(days.slice(0, 2)).toEqual([5, 12]);
    expect(friends[0]?.user.name).toBe("Нурай");
    const sorted = [...days].sort((a, b) => (a ?? 999) - (b ?? 999));
    expect(days).toEqual(sorted);
  });

  it("PATCH /me меняет профиль, пустое имя — ошибка валидации", async () => {
    const user = await newUser();
    const updated = await call<User>("PATCH", "/me", user.id, {
      name: "Новое",
    });
    expect(updated.name).toBe("Новое");
    await expect(
      call("PATCH", "/me", user.id, { name: "  " }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("без сессии — FORBIDDEN, несуществующий профиль — NOT_FOUND", async () => {
    await expect(call("GET", "/me", null)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(call("GET", "/me", "u_nope")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("демо-вход — «Айгерим» с заполненным вишлистом, больше не бот", async () => {
    const user = await call<User>("POST", "/auth/demo", null);
    expect(user.id).toBe(DEMO_USER_ID);
    expect(user.isBot).toBe(false);
    const snapshot = db.snapshot();
    expect(
      snapshot?.wishlistItems[DEMO_USER_ID]?.length,
    ).toBeGreaterThanOrEqual(5);
    expect(snapshot?.wishlistMeta[DEMO_USER_ID]?.shareUnlockedAt).toBeTruthy();
  });
});

describe("лента", () => {
  it("отдаёт порцию 10 и общее число кандидатов", async () => {
    const user = await newUser();
    const feed = await call<FeedResponse>(
      "GET",
      "/catalog/feed",
      user.id,
      undefined,
      {
        context: "self",
      },
    );
    expect(feed.items).toHaveLength(10);
    expect(feed.total).toBe(24);
  });

  it("исключает уже свайпнутые и переданные в exclude", async () => {
    const user = await newUser();
    const first = await call<FeedResponse>("GET", "/catalog/feed", user.id);
    const [a, b] = first.items as [Product, Product];
    await db.write((data) => {
      data.productSwipes.push({
        id: "sw_1",
        userId: user.id,
        productId: a.id,
        decision: "pass",
        context: { kind: "self" },
        at: new Date(NOW).toISOString(),
      });
    });
    const next = await call<FeedResponse>(
      "GET",
      "/catalog/feed",
      user.id,
      undefined,
      {
        exclude: b.id,
        limit: 50,
      },
    );
    const ids = next.items.map((p) => p.id);
    expect(ids).not.toContain(a.id);
    expect(ids).not.toContain(b.id);
    expect(next.total).toBe(22);
  });

  it("фильтр бюджета и категорий; счётчик совпадает с лентой", async () => {
    const user = await newUser();
    const filters = {
      budget: { min: 0, max: 3000 },
      categories: [],
      marketplaces: [],
    };
    const query = { filters: JSON.stringify(filters), limit: 50 };
    const feed = await call<FeedResponse>(
      "GET",
      "/catalog/feed",
      user.id,
      undefined,
      query,
    );
    expect(feed.items.length).toBeGreaterThan(0);
    expect(feed.items.every((p) => p.priceMin <= 3000)).toBe(true);
    const { count } = await call<{ count: number }>(
      "GET",
      "/catalog/count",
      user.id,
      undefined,
      query,
    );
    expect(count).toBe(feed.total);
  });

  it("«для него» не показывает товары только для неё", async () => {
    const user = await newUser({ audience: "male" });
    const feed = await call<FeedResponse>(
      "GET",
      "/catalog/feed",
      user.id,
      undefined,
      { limit: 50 },
    );
    expect(feed.items.some((p) => p.audience === "female")).toBe(false);
    expect(feed.items.length).toBe(
      products.filter((p) => p.audience !== "female").length,
    );
  });

  it("битые фильтры — VALIDATION", async () => {
    const user = await newUser();
    await expect(
      call("GET", "/catalog/feed", user.id, undefined, { filters: "{не json" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("демо", () => {
  it("сброс пересоздаёт базу: созданный пользователь исчезает", async () => {
    const user = await newUser();
    await call("POST", "/demo/reset", user.id);
    await expect(call("GET", "/me", user.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    const last = realtime.events.at(-1);
    expect(last).toMatchObject({ type: "db:changed" });
  });

  it("настройки демо читаются и меняются", async () => {
    const next = await call<{ botSpeed: string }>(
      "PATCH",
      "/demo/settings",
      null,
      {
        botSpeed: "fast",
      },
    );
    expect(next.botSpeed).toBe("fast");
    await expect(
      call("PATCH", "/demo/settings", null, { botSpeed: "turbo" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("неизвестный маршрут — NOT_FOUND", async () => {
    await expect(call("GET", "/nope", null)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
