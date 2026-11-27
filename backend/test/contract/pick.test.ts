import type { FeedResponse } from "@swipeit/core/api/catalog/types";
import type { PickAnswer, PickRequest } from "@swipeit/core/api/pick/types";
import type { MeResponse } from "@swipeit/core/api/users/types";
import type { WishlistResponse } from "@swipeit/core/api/wishlist/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ApiClient, type Caller, CLIENTS } from "./client";

// Контрактный тест «Выбери подарок сам» (BACKEND.md B09) — по pick.test.ts
// мока. Адрес ссылки у мока и сервера разный (длинная и короткая), поэтому
// сравниваем то, что в ней.
const FILTERS = {
  budget: { min: 0, max: 5000 },
  categories: ["tech", "sport"],
  marketplaces: [],
};

describe.each(CLIENTS)("«Выбери подарок сам» — %s", (_name, create) => {
  let api: ApiClient;
  beforeEach(async () => {
    api = await create();
  });
  afterEach(() => api.close());

  const person = async (patch: Record<string, unknown>) => {
    const { caller } = await api.newUser();
    await api.call(caller, "PATCH", "/me", patch);
    return caller;
  };
  const createRequest = (caller: Caller) =>
    api.call<{ request: PickRequest; url: string }>(
      caller,
      "POST",
      "/pick-requests",
      {
        toName: "Айжан",
        filters: FILTERS,
        hidePrices: true,
        message: "Выбери что-нибудь",
      },
    );
  const swipe = (
    caller: Caller,
    requestId: string,
    productId: string,
    decision: "like" | "pass" | "superlike",
    variantChoice?: Record<string, string>,
  ) =>
    api.call(caller, "POST", "/swipes", {
      productId,
      decision,
      context: { kind: "pick", requestId },
      ...(variantChoice ? { variantChoice } : {}),
    });
  const picks = async (caller: Caller, requestId: string) =>
    (
      await api.call<{ picks: PickAnswer["picks"] }>(
        caller,
        "GET",
        `/pick-requests/${requestId}/picks`,
      )
    ).picks;
  const pickFeed = (caller: Caller, requestId: string) =>
    api.call<FeedResponse>(caller, "GET", "/catalog/feed", undefined, {
      context: `pick:${requestId}`,
      filters: JSON.stringify(FILTERS),
    });

  it("ссылка-фильтр — с отправителем, фильтрами и скрытыми ценами; без имени — NAME_REQUIRED", async () => {
    const sender = await person({ name: "Айгерим" });
    const { request, url } = await createRequest(sender);
    expect(url).toEqual(expect.any(String));
    expect(request).toMatchObject({
      id: expect.stringMatching(/^pk_/),
      from: { name: "Айгерим", userId: sender.id },
      toName: "Айжан",
      filters: FILTERS,
      hidePrices: true,
      message: "Выбери что-нибудь",
    });
    const { caller: nameless } = await api.newUser();
    await expect(createRequest(nameless)).rejects.toMatchObject({
      code: "NAME_REQUIRED",
    });
  });

  it("лента друга — в рамках фильтров; «Хочу» не попадает в его вишлист и вкус", async () => {
    const friend = await person({ name: "Айжан", audience: "female" });
    const requestId = "pk_test";
    const page = await pickFeed(friend, requestId);
    expect(page.items.length).toBeGreaterThan(0);
    for (const product of page.items) {
      expect(["tech", "sport"]).toContain(product.category);
      expect(product.priceMin).toBeLessThanOrEqual(5000);
    }
    const first = page.items[0]?.id ?? "";
    await swipe(friend, requestId, first, "superlike");
    const own = await api.call<WishlistResponse>(friend, "GET", "/wishlist");
    expect(own.items).toEqual([]);
    expect(own.wishCount).toBe(0);
    expect(
      (await api.call<MeResponse>(friend, "GET", "/me")).taste,
    ).toBeUndefined();
    const after = await pickFeed(friend, requestId);
    expect(after.items.map((p) => p.id)).not.toContain(first);
  });

  it("picks — лайки в порядке свайпов, «Мимо» не считается, undo убирает", async () => {
    const friend = await person({ name: "Айжан" });
    const requestId = "pk_test";
    await swipe(friend, requestId, "p_0008", "like");
    await swipe(friend, requestId, "p_0015", "pass");
    await swipe(friend, requestId, "p_0023", "superlike", { color: "black" });
    expect(await picks(friend, requestId)).toEqual([
      { productId: "p_0008", priority: "normal" },
      {
        productId: "p_0023",
        priority: "top",
        variantChoice: { color: "black" },
      },
    ]);
    await api.call(friend, "POST", "/swipes/undo", {
      context: { kind: "pick", requestId },
    });
    expect(await picks(friend, requestId)).toHaveLength(1);
  });

  it("ответ: пустой выбор — VALIDATION; пол «для неё» едет, «всем» — нет", async () => {
    const sender = await person({ name: "Айгерим" });
    const { request } = await createRequest(sender);
    const friend = await person({ name: "Айжан", audience: "female" });
    await expect(
      api.call(friend, "POST", `/pick-requests/${request.id}/answer`),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await swipe(friend, request.id, "p_0008", "like");
    await swipe(friend, request.id, "p_0023", "superlike");
    const { answer } = await api.call<{ answer: PickAnswer }>(
      friend,
      "POST",
      `/pick-requests/${request.id}/answer`,
    );
    expect(answer).toMatchObject({
      requestId: request.id,
      by: { name: "Айжан", gender: "female", userId: friend.id },
      picks: [
        { productId: "p_0008", priority: "normal" },
        { productId: "p_0023", priority: "top" },
      ],
    });
    const neutral = await person({ name: "Бакыт" });
    await swipe(neutral, request.id, "p_0008", "like");
    const second = await api.call<{ answer: PickAnswer }>(
      neutral,
      "POST",
      `/pick-requests/${request.id}/answer`,
    );
    expect(second.answer.by.gender).toBeUndefined();
  });

  it("битая ссылка-ответ — VALIDATION", async () => {
    const someone = await person({ name: "Айгерим" });
    await expect(
      api.call(someone, "POST", "/pick-answers", { encoded: "битая" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});
