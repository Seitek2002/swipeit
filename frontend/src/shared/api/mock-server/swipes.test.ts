import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { FeedResponse } from "../catalog/types";
import type { User } from "../users/types";
import type {
  SwipeContext,
  SwipeDecision,
  SwipeResponse,
  WishlistResponse,
} from "../wishlist/types";
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
import { SHARE_UNLOCK_WISHES } from "./share-threshold";

// Маршруты свайпов мок-сервера в окружении node, с базой в памяти.
// Каталог — заглушка catalog-stub (24 товара).
const stubPath = fileURLToPath(
  new URL("../../../../catalog-stub/products.json", import.meta.url),
);
const { items: products } = parseProducts(
  JSON.parse(readFileSync(stubPath, "utf8")),
);
const ids = products.map((product) => product.id);
const id = (index: number) => ids[index] as string;

// 26.11.2026 12:00 — фиксированные часы демо.
const NOW = new Date(2026, 10, 26, 12).getTime();

const SELF: SwipeContext = { kind: "self" };
const PICK: SwipeContext = { kind: "pick", requestId: "r1" };

let server: MockServer;
let realtime: ReturnType<typeof createRecordingRealtime>;

const call = <T>(
  method: "DELETE" | "GET" | "PATCH" | "POST",
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

const swipe = (
  userId: null | string,
  productId: string,
  decision: SwipeDecision,
  context: SwipeContext = SELF,
  variantChoice?: Record<string, string>,
) =>
  call<SwipeResponse>("POST", "/swipes", userId, {
    productId,
    decision,
    context,
    variantChoice,
  });

const wishlist = (userId: string) =>
  call<WishlistResponse>("GET", "/wishlist", userId);

const feedIds = async (userId: string, context = "self") => {
  const feed = await call<FeedResponse>(
    "GET",
    "/catalog/feed",
    userId,
    undefined,
    { context, limit: 50 },
  );
  return feed.items.map((product) => product.id);
};

// Ставит n «Хочу» подряд на первые n товаров каталога.
const likeFirst = async (userId: string, n: number) => {
  const responses: SwipeResponse[] = [];
  for (let i = 0; i < n; i++) {
    responses.push(await swipe(userId, id(i), "like"));
  }
  return responses;
};

beforeEach(() => {
  const catalog = createMemoryCatalog(products);
  const clock = createFixedClock(NOW);
  realtime = createRecordingRealtime();
  const db = createMemoryDb(async () =>
    createSeedDb({ products, now: clock.now() }),
  );
  server = createMockServer({
    catalog,
    clock,
    db,
    realtime,
    random: createSeededRandom("test"),
    settings: createMemorySettings(),
  });
});

describe("свайп в своей ленте", () => {
  it("«Хочу» кладёт активный товар с обычным приоритетом и вариантом", async () => {
    const user = await newUser();
    const response = await swipe(user.id, id(0), "like", SELF, {
      color: "чёрный",
      size: "M",
    });
    expect(response.wishlistItemId).toMatch(/^wi_/);
    const { items } = await wishlist(user.id);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: response.wishlistItemId,
      ownerId: user.id,
      source: { kind: "product", productId: id(0) },
      priority: "normal",
      status: "active",
      variantChoice: { color: "чёрный", size: "M" },
    });
  });

  it("«Очень хочу» — приоритет top", async () => {
    const user = await newUser();
    await swipe(user.id, id(0), "superlike");
    const { items } = await wishlist(user.id);
    expect(items).toHaveLength(1);
    expect(items[0]?.priority).toBe("top");
  });

  it("«Пропустить» ничего не добавляет и не считается лайком", async () => {
    const user = await newUser();
    const response = await swipe(user.id, id(0), "pass");
    expect(response.wishlistItemId).toBeUndefined();
    expect(response.wishCount).toBe(0);
    const list = await wishlist(user.id);
    expect(list.items).toHaveLength(0);
    expect(list.wishCount).toBe(0);
  });
});

describe("порог шеринга", () => {
  it("wishCount растёт только от «Хочу» и «Очень хочу»", async () => {
    const user = await newUser();
    expect((await swipe(user.id, id(0), "like")).wishCount).toBe(1);
    expect((await swipe(user.id, id(1), "pass")).wishCount).toBe(1);
    expect((await swipe(user.id, id(2), "superlike")).wishCount).toBe(2);
    expect((await wishlist(user.id)).wishCount).toBe(2);
  });

  it("на 5-м лайке шеринг открывается, на 6-м — уже открыт", async () => {
    expect(SHARE_UNLOCK_WISHES).toBe(5);
    const user = await newUser();
    const responses = await likeFirst(user.id, 4);
    expect(responses.every((r) => !r.shareUnlocked)).toBe(true);
    expect((await wishlist(user.id)).meta.shareUnlockedAt).toBeUndefined();

    const fifth = await swipe(user.id, id(4), "like");
    expect(fifth).toMatchObject({
      wishCount: 5,
      shareJustUnlocked: true,
      shareUnlocked: true,
    });
    const list = await wishlist(user.id);
    expect(list.meta.shareUnlockedAt).toBe(new Date(NOW).toISOString());

    const sixth = await swipe(user.id, id(5), "like");
    expect(sixth).toMatchObject({
      wishCount: 6,
      shareJustUnlocked: false,
      shareUnlocked: true,
    });
  });
});

describe("отмена свайпа", () => {
  it("убирает последний свайп и созданный им товар вишлиста", async () => {
    const user = await newUser();
    await swipe(user.id, id(0), "like");
    await swipe(user.id, id(1), "superlike");
    const result = await call<{ productId: string; wishCount: number }>(
      "POST",
      "/swipes/undo",
      user.id,
      { context: SELF },
    );
    expect(result).toEqual({ productId: id(1), wishCount: 1 });
    const list = await wishlist(user.id);
    expect(list.items.map((item) => item.source)).toEqual([
      { kind: "product", productId: id(0) },
    ]);
    expect(list.wishCount).toBe(1);
  });

  it("после отмены ниже 5 лайков шеринг остаётся открытым", async () => {
    const user = await newUser();
    await likeFirst(user.id, 5);
    await call("POST", "/swipes/undo", user.id, { context: SELF });
    const list = await wishlist(user.id);
    expect(list.wishCount).toBe(4);
    expect(list.items).toHaveLength(4);
    expect(list.meta.shareUnlockedAt).toBeTruthy();
    // Повторный 5-й лайк не запускает бант второй раз.
    const again = await swipe(user.id, id(4), "like");
    expect(again.shareJustUnlocked).toBe(false);
    expect(again.shareUnlocked).toBe(true);
  });

  it("отмена без свайпов — NOT_FOUND", async () => {
    const user = await newUser();
    await expect(
      call("POST", "/swipes/undo", user.id, { context: SELF }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("свайпы и лента", () => {
  it("свайпнутые товары уходят из ленты и возвращаются после отмены", async () => {
    const user = await newUser();
    expect(await feedIds(user.id)).toHaveLength(24);
    await swipe(user.id, id(0), "like");
    await swipe(user.id, id(1), "pass");
    const after = await feedIds(user.id);
    expect(after).toHaveLength(22);
    expect(after).not.toContain(id(0));
    expect(after).not.toContain(id(1));

    await call("POST", "/swipes/undo", user.id, { context: SELF });
    const undone = await feedIds(user.id);
    expect(undone).toContain(id(1));
    expect(undone).not.toContain(id(0));
  });

  it("свайпы в подборе для друга не трогают вишлист и свою ленту", async () => {
    const user = await newUser();
    const like = await swipe(user.id, id(0), "like", PICK);
    const superlike = await swipe(user.id, id(1), "superlike", PICK);
    expect(like.wishlistItemId).toBeUndefined();
    expect(like.wishCount).toBe(0);
    expect(superlike.wishCount).toBe(0);
    const list = await wishlist(user.id);
    expect(list.items).toHaveLength(0);
    expect(list.wishCount).toBe(0);

    const pick = await feedIds(user.id, "pick:r1");
    expect(pick).not.toContain(id(0));
    expect(pick).not.toContain(id(1));
    const self = await feedIds(user.id, "self");
    expect(self).toContain(id(0));
    expect(self).toContain(id(1));
  });

  it("«Начать заново» возвращает только пропущенные в этом контексте", async () => {
    const user = await newUser();
    await swipe(user.id, id(0), "like");
    await swipe(user.id, id(1), "pass");
    await swipe(user.id, id(2), "pass");
    await swipe(user.id, id(3), "pass", PICK);
    const { removed } = await call<{ removed: number }>(
      "POST",
      "/swipes/restart",
      user.id,
      { context: SELF },
    );
    expect(removed).toBe(2);
    const self = await feedIds(user.id);
    expect(self).toContain(id(1));
    expect(self).toContain(id(2));
    expect(self).not.toContain(id(0));
    // Пропуск в подборе для друга остался.
    expect(await feedIds(user.id, "pick:r1")).not.toContain(id(3));
    expect((await wishlist(user.id)).wishCount).toBe(1);
  });
});

describe("ошибки свайпа", () => {
  it("неизвестный товар — NOT_FOUND", async () => {
    const user = await newUser();
    await expect(swipe(user.id, "p_nope", "like")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("неверное решение — VALIDATION", async () => {
    const user = await newUser();
    await expect(
      call("POST", "/swipes", user.id, {
        productId: id(0),
        decision: "maybe",
        context: SELF,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("без сессии — FORBIDDEN", async () => {
    await expect(swipe(null, id(0), "like")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(
      call("POST", "/swipes/undo", null, { context: SELF }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call("POST", "/swipes/restart", null, { context: SELF }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("realtime", () => {
  it("«Хочу» публикует db:changed со scope wishlist", async () => {
    const user = await newUser();
    realtime.events.length = 0;
    await swipe(user.id, id(0), "like");
    expect(realtime.events).toHaveLength(1);
    const event = realtime.events[0];
    expect(event).toMatchObject({ type: "db:changed", by: user.id });
    expect(event && "scope" in event ? event.scope : []).toContain("wishlist");
  });

  it("«Пропустить» не трогает scope wishlist", async () => {
    const user = await newUser();
    realtime.events.length = 0;
    await swipe(user.id, id(0), "pass");
    expect(realtime.events.at(-1)).toMatchObject({
      type: "db:changed",
      scope: ["swipes"],
    });
  });
});

describe("порог отправки: свои желания считаются (TECH_SPEC §6)", () => {
  type Created = { shareJustUnlocked: boolean; wishCount: number };
  const custom = (userId: string, title: string) =>
    call<Created & { id: string }>("POST", "/wishlist/items", userId, {
      title,
    });

  it("3 «Хочу» + 2 своих → открыто, shareJustUnlocked один раз", async () => {
    const user = await newUser();
    await likeFirst(user.id, 3);
    const fourth = await custom(user.id, "Свитер");
    expect(fourth).toMatchObject({ wishCount: 4, shareJustUnlocked: false });
    const fifth = await custom(user.id, "Шарф");
    expect(fifth).toMatchObject({ wishCount: 5, shareJustUnlocked: true });
    expect((await wishlist(user.id)).meta.shareUnlockedAt).toBeDefined();
    const sixth = await swipe(user.id, id(5), "like");
    expect(sixth).toMatchObject({ wishCount: 6, shareJustUnlocked: false });
  });

  it("до открытия удаление уменьшает wishCount, после — не закрывает", async () => {
    const user = await newUser();
    await likeFirst(user.id, 3);
    const own = await custom(user.id, "Свитер");
    await call("DELETE", `/wishlist/items/${own.id}`, user.id);
    expect((await wishlist(user.id)).wishCount).toBe(3);

    await custom(user.id, "Шарф");
    const unlocked = await custom(user.id, "Плед");
    expect(unlocked.shareJustUnlocked).toBe(true);
    await call("DELETE", `/wishlist/items/${unlocked.id}`, user.id);
    const after = await wishlist(user.id);
    expect(after.wishCount).toBe(4);
    expect(after.meta.shareUnlockedAt).toBeDefined();
  });
});
