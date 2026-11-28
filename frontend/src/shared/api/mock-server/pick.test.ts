import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import {
  decodePickAnswer,
  decodePickRequest,
  encodePickAnswer,
} from "@/shared/lib/share-codec";

import type { FeedResponse } from "../catalog/types";
import type { PickAnswer, PickRequest } from "../pick/types";
import type { User } from "../users/types";
import type { WishlistResponse } from "../wishlist/types";
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

// «Выбери подарок сам»: ссылка-фильтр, свайпы друга в контексте pick,
// ссылка-ответ и её импорт у отправителя.
const stubPath = fileURLToPath(
  new URL("../../../../catalog-stub/products.json", import.meta.url),
);
const { items: products } = parseProducts(
  JSON.parse(readFileSync(stubPath, "utf8")),
);

const NOW = new Date(2026, 10, 26, 12).getTime();

let server: MockServer;

const call = <T>(
  method: "DELETE" | "GET" | "PATCH" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
  query?: Record<string, unknown>,
) => server.handle({ method, path, userId, body, query }) as Promise<T>;

const newFriend = (audience: "all" | "female" | "male" = "female") =>
  call<User>("POST", "/users", null, {
    name: "Айжан",
    avatarColor: "mandarin",
    interests: [],
    audience,
  });

const FILTERS = {
  budget: { min: 0, max: 5000 },
  categories: ["tech", "sport"],
  marketplaces: [],
};

const createRequest = (userId: string, hidePrices = true) =>
  call<{ request: PickRequest; url: string }>(
    "POST",
    "/pick-requests",
    userId,
    {
      toName: "Айжан",
      filters: FILTERS,
      hidePrices,
      occasion: { kind: "birthday", date: "2027-03-14" },
      message: "Выбери что-нибудь",
    },
  );

const swipe = (
  userId: string,
  requestId: string,
  productId: string,
  decision: "like" | "pass" | "superlike",
  variantChoice?: Record<string, string>,
) =>
  call("POST", "/swipes", userId, {
    productId,
    decision,
    context: { kind: "pick", requestId },
    variantChoice,
  });

const feed = (userId: string, requestId: string) =>
  call<FeedResponse>("GET", "/catalog/feed", userId, undefined, {
    filters: JSON.stringify(FILTERS),
    context: `pick:${requestId}`,
    limit: 50,
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
    random: createSeededRandom("test"),
    settings: createMemorySettings(),
  });
});

describe("ссылка-фильтр", () => {
  it("создаёт /pick/?d= с отправителем, фильтрами и скрытыми ценами", async () => {
    await call("POST", "/auth/demo", null);
    const { url, request } = await createRequest(DEMO_USER_ID);
    expect(url.startsWith("/pick/?d=")).toBe(true);
    const decoded = decodePickRequest(url.slice("/pick/?d=".length));
    expect(decoded).toMatchObject({
      id: request.id,
      from: { name: "Айгерим", userId: DEMO_USER_ID },
      toName: "Айжан",
      filters: FILTERS,
      hidePrices: true,
      message: "Выбери что-нибудь",
    });
  });

  it("без профиля — ошибка", async () => {
    await expect(createRequest("u_nobody")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});

describe("свайпы друга по ссылке", () => {
  it("лента — в рамках фильтров, «Хочу» не попадает в свой вишлист", async () => {
    const friend = await newFriend();
    const requestId = "pk_test";
    const { items } = await feed(friend.id, requestId);
    expect(items.length).toBeGreaterThan(0);
    for (const product of items) {
      expect(["tech", "sport"]).toContain(product.category);
      expect(product.priceMin).toBeLessThanOrEqual(5000);
    }
    const first = items[0];
    if (!first) throw new Error("пустая лента");
    await swipe(friend.id, requestId, first.id, "like");
    const own = await call<WishlistResponse>("GET", "/wishlist", friend.id);
    expect(own.items).toHaveLength(0);
    expect(own.wishCount).toBe(0);
    const after = await feed(friend.id, requestId);
    expect(after.items.map((product) => product.id)).not.toContain(first.id);
  });

  it("picks — лайки в порядке свайпов, «Мимо» не считается, undo убирает", async () => {
    const friend = await newFriend();
    const requestId = "pk_test";
    await swipe(friend.id, requestId, "p_0008", "like");
    await swipe(friend.id, requestId, "p_0015", "pass");
    await swipe(friend.id, requestId, "p_0023", "superlike", {
      color: "black",
    });
    const { picks } = await call<{ picks: PickAnswer["picks"] }>(
      "GET",
      `/pick-requests/${requestId}/picks`,
      friend.id,
    );
    expect(picks).toEqual([
      { productId: "p_0008", priority: "normal" },
      {
        productId: "p_0023",
        priority: "top",
        variantChoice: { color: "black" },
      },
    ]);
    await call("POST", "/swipes/undo", friend.id, {
      context: { kind: "pick", requestId },
    });
    const undone = await call<{ picks: unknown[] }>(
      "GET",
      `/pick-requests/${requestId}/picks`,
      friend.id,
    );
    expect(undone.picks).toHaveLength(1);
  });
});

describe("ссылка-ответ", () => {
  it("друг отвечает, отправитель импортирует — с поводом из своего запроса", async () => {
    await call("POST", "/auth/demo", null);
    const { request } = await createRequest(DEMO_USER_ID);
    const friend = await newFriend("female");
    await swipe(friend.id, request.id, "p_0008", "like");
    await swipe(friend.id, request.id, "p_0023", "superlike");
    const { url } = await call<{ url: string }>(
      "POST",
      `/pick-requests/${request.id}/answer`,
      friend.id,
    );
    expect(url.startsWith("/pick/answer/?d=")).toBe(true);
    const encoded = url.slice("/pick/answer/?d=".length);
    expect(decodePickAnswer(encoded)).toMatchObject({
      requestId: request.id,
      by: { name: "Айжан", gender: "female" },
      picks: [
        { productId: "p_0008" },
        { productId: "p_0023", priority: "top" },
      ],
    });

    const imported = await call<{
      answer: PickAnswer;
      request: null | PickRequest;
    }>("POST", "/pick-answers", DEMO_USER_ID, { encoded });
    expect(imported.answer.picks).toHaveLength(2);
    expect(imported.request?.hidePrices).toBe(true);
    // Повторное открытие той же ссылки не плодит копии.
    await call("POST", "/pick-answers", DEMO_USER_ID, { encoded });
    const again = await call<{ answer: PickAnswer }>(
      "POST",
      "/pick-answers",
      DEMO_USER_ID,
      { encoded },
    );
    expect(again.answer.answeredAt).toBe(imported.answer.answeredAt);
  });

  it("пустой выбор — ошибка, пол «всем» не передаётся", async () => {
    const friend = await newFriend("all");
    await expect(
      call("POST", "/pick-requests/pk_x/answer", friend.id),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await swipe(friend.id, "pk_x", "p_0008", "like");
    const { answer } = await call<{ answer: PickAnswer }>(
      "POST",
      "/pick-requests/pk_x/answer",
      friend.id,
    );
    expect(answer.by.gender).toBeUndefined();
  });

  it("битая ссылка-ответ и чужой запрос — понятные ответы", async () => {
    await expect(
      call("POST", "/pick-answers", null, { encoded: "битая" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const encoded = encodePickAnswer({
      requestId: "pk_other_device",
      by: { name: "Айжан", avatarColor: "mint" },
      picks: [{ productId: "p_0008", priority: "normal" }],
    });
    const result = await call<{ request: null | PickRequest }>(
      "POST",
      "/pick-answers",
      null,
      { encoded },
    );
    expect(result.request).toBeNull();
  });
});

describe("«Сколько можно выбрать»", () => {
  it("лимит едет в ссылке ?d=; 4 «Хочу» при лимите 3 — VALIDATION, 3 — ответ", async () => {
    await call("POST", "/auth/demo", null);
    const { url, request } = await call<{ request: PickRequest; url: string }>(
      "POST",
      "/pick-requests",
      DEMO_USER_ID,
      { filters: FILTERS, hidePrices: false, maxPicks: 3 },
    );
    expect(request.maxPicks).toBe(3);
    expect(decodePickRequest(url.slice("/pick/?d=".length))?.maxPicks).toBe(3);

    const friend = await newFriend();
    for (const product of products.slice(0, 4)) {
      await swipe(friend.id, request.id, product.id, "like");
    }
    const answer = () =>
      call<{ answer: PickAnswer }>(
        "POST",
        `/pick-requests/${request.id}/answer`,
        friend.id,
      );
    await expect(answer()).rejects.toMatchObject({ code: "VALIDATION" });
    await call("POST", "/swipes/undo", friend.id, {
      context: { kind: "pick", requestId: request.id },
    });
    expect((await answer()).answer.picks).toHaveLength(3);
  });

  it("лимит вне 1…20 — VALIDATION; без лимита — сколько угодно", async () => {
    await call("POST", "/auth/demo", null);
    for (const maxPicks of [0, 21]) {
      await expect(
        call("POST", "/pick-requests", DEMO_USER_ID, {
          filters: FILTERS,
          hidePrices: false,
          maxPicks,
        }),
      ).rejects.toMatchObject({ code: "VALIDATION" });
    }
    const { request } = await createRequest(DEMO_USER_ID);
    expect(request.maxPicks).toBeUndefined();
  });
});

describe("ссылка-ответ на новом устройстве (auto-tasks-ux-6 G01)", () => {
  it("без профиля и без сохранённой сессии: ответ разбирается, подарки отдаются", async () => {
    // Свежая вкладка: базы ещё нет, userId пуст — как во встроенном
    // браузере Telegram, где SwipeIt не открывали.
    const encoded = encodePickAnswer({
      requestId: "pk_from_friend",
      by: { name: "Нурай", avatarColor: "mint" },
      picks: [
        { productId: "p_0008", priority: "normal" },
        { productId: "p_0023", priority: "top" },
      ],
    });
    const imported = await call<{ answer: PickAnswer }>(
      "POST",
      "/pick-answers",
      null,
      { encoded },
    );
    expect(imported.answer.picks).toHaveLength(2);
    for (const pick of imported.answer.picks) {
      await expect(
        call("GET", `/catalog/products/${pick.productId}`, null),
      ).resolves.toMatchObject({ id: pick.productId });
    }
  });
});

describe("ревью этапа 2", () => {
  it("два друга с одинаковым именем — два ответа, а не один", async () => {
    await call("POST", "/auth/demo", null);
    const { request } = await createRequest(DEMO_USER_ID);
    const answers: string[] = [];
    for (let index = 0; index < 2; index += 1) {
      const friend = await newFriend();
      await swipe(friend.id, request.id, "p_0008", "like");
      const { url } = await call<{ url: string }>(
        "POST",
        `/pick-requests/${request.id}/answer`,
        friend.id,
      );
      answers.push(url.slice("/pick/answer/?d=".length));
    }
    for (const encoded of answers) {
      await call("POST", "/pick-answers", DEMO_USER_ID, { encoded });
    }
    const ids = answers.map((encoded) => decodePickAnswer(encoded)?.by.userId);
    expect(new Set(ids).size).toBe(2);
    // Повторный импорт первого не добавляет третий ответ.
    await call("POST", "/pick-answers", DEMO_USER_ID, { encoded: answers[0] });
  });
});
