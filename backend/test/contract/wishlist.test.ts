import type { Product } from "@swipeit/core/api/catalog/types";
import type {
  SwipeResponse,
  WishlistItem,
  WishlistMeta,
  WishlistResponse,
} from "@swipeit/core/api/wishlist/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ApiClient, type Caller, CLIENTS, testCatalog } from "./client";

// Контрактный тест своего вишлиста (BACKEND.md B07) — по wishlist.test.ts
// мока: порядок, заметка, вариант, своё желание, «Мне это подарили» и
// «Отменить», «Вернуть».
const GIVEN_AT = "2026-11-25T10:00:00.000Z";

describe.each(CLIENTS)("вишлист — %s", (_name, create) => {
  let api: ApiClient;
  let me: Caller;
  let products: readonly Product[];
  beforeEach(async () => {
    api = await create();
    ({ caller: me } = await api.newUser());
    ({ products } = await testCatalog());
  });
  afterEach(() => api.close());

  const wishlist = (caller = me) =>
    api.call<WishlistResponse>(caller, "GET", "/wishlist");
  const ids = async () => (await wishlist()).items.map((item) => item.id);
  const find = async (id: string) =>
    (await wishlist()).items.find((item) => item.id === id);
  const like = async (index: number) =>
    (
      await api.call<SwipeResponse>(me, "POST", "/swipes", {
        productId: products[index]?.id,
        decision: "like",
        context: { kind: "self" },
      })
    ).wishlistItemId ?? "";
  const addCustom = (body: Record<string, unknown>) =>
    api.call<WishlistItem & { shareJustUnlocked: boolean; wishCount: number }>(
      me,
      "POST",
      "/wishlist/items",
      body,
    );
  const patch = (id: string, body: unknown) =>
    api.call<WishlistItem>(me, "PATCH", `/wishlist/items/${id}`, body);
  const code = (promise: Promise<unknown>) =>
    promise.then(
      () => "ok",
      (error: { code?: string }) => error.code,
    );

  it("своё желание — в конец, активное, обычный приоритет; в пустом — order 0", async () => {
    const first = await addCustom({ title: "Книга", priceMin: 500 });
    expect(first).toMatchObject({
      order: 0,
      status: "active",
      priority: "normal",
      source: { kind: "custom", custom: { title: "Книга", priceMin: 500 } },
      wishCount: 1,
      shareJustUnlocked: false,
    });
    await like(0);
    const second = await addCustom({ title: "  Свитер  " });
    expect(second.order).toBe(2);
    expect(second.source).toEqual({
      kind: "custom",
      custom: { title: "Свитер" },
    });
    expect((await wishlist()).wishCount).toBe(3);
    expect(await code(addCustom({ title: "  " }))).toBe("VALIDATION");
    expect(
      await code(addCustom({ title: "Х", priceMin: 900, priceMax: 100 })),
    ).toBe("VALIDATION");
  });

  it("своё желание считается в порог: 3 «Хочу» + 2 своих открывают отправку", async () => {
    for (const index of [0, 1, 2]) await like(index);
    expect((await addCustom({ title: "Раз" })).shareJustUnlocked).toBe(false);
    const fifth = await addCustom({ title: "Два" });
    expect(fifth).toMatchObject({ shareJustUnlocked: true, wishCount: 5 });
    expect((await wishlist()).meta.shareUnlockedAt).toEqual(expect.any(String));
  });

  it("приоритет, вариант и заметка; пустая заметка убирает её", async () => {
    const id = await like(0);
    expect((await patch(id, { priority: "top" })).priority).toBe("top");
    expect((await patch(id, { priority: "normal" })).priority).toBe("normal");
    const updated = await patch(id, {
      variantChoice: { Цвет: "чёрный" },
      note: "  размер M ",
    });
    expect(updated).toMatchObject({
      variantChoice: { Цвет: "чёрный" },
      note: "размер M",
    });
    expect(await find(id)).toMatchObject({ note: "размер M" });
    expect((await patch(id, { note: "" })).note).toBeUndefined();
    expect(await code(patch(id, { note: "а".repeat(141) }))).toBe("VALIDATION");
    expect(await code(patch("wi_nope", { priority: "top" }))).toBe("NOT_FOUND");
  });

  it("чужое желание — NOT_FOUND и не меняется", async () => {
    const id = await like(0);
    const { caller: other } = await api.newUser();
    expect(
      await code(
        api.call(other, "PATCH", `/wishlist/items/${id}`, { priority: "top" }),
      ),
    ).toBe("NOT_FOUND");
    expect(await code(api.call(other, "DELETE", `/wishlist/items/${id}`))).toBe(
      "NOT_FOUND",
    );
    expect((await find(id))?.priority).toBe("normal");
    expect((await wishlist(other)).items).toEqual([]);
  });

  it("удалить и «Отменить»: желание возвращается на то же место", async () => {
    const a = await like(0);
    const b = await like(1);
    const c = await like(2);
    const removed = await api.call<WishlistItem>(
      me,
      "DELETE",
      `/wishlist/items/${b}`,
    );
    expect(removed).toMatchObject({ id: b, order: 1 });
    expect(await ids()).toEqual([a, c]);
    expect((await wishlist()).wishCount).toBe(2);
    // Клиент шлёт желание целиком (мок его читает, сервер — нет).
    await api.call(me, "POST", `/wishlist/items/${b}/undelete`, removed);
    expect(await ids()).toEqual([a, b, c]);
    expect((await find(b))?.order).toBe(1);
    expect(await code(api.call(me, "DELETE", "/wishlist/items/wi_nope"))).toBe(
      "NOT_FOUND",
    );
    // Чужое вернуть нельзя: мок — FORBIDDEN, сервер — NOT_FOUND (§4.5: не
    // говорим даже, что оно есть).
    const { caller: other } = await api.newUser();
    await api.call(me, "DELETE", `/wishlist/items/${a}`);
    expect(["FORBIDDEN", "NOT_FOUND"]).toContain(
      await code(
        api.call(other, "POST", `/wishlist/items/${a}/undelete`, {
          ...removed,
          id: a,
        }),
      ),
    );
    expect(await ids()).toEqual([b, c]);
  });

  it("ручной порядок; не упомянутые — в конец, в своём порядке", async () => {
    const all = [await like(0), await like(1), await like(2), await like(3)];
    await api.call(me, "POST", "/wishlist/reorder", {
      ids: [...all].reverse(),
    });
    expect(await ids()).toEqual([...all].reverse());
    await api.call(me, "POST", "/wishlist/reorder", { ids: [all[2]] });
    expect(await ids()).toEqual([all[2], all[3], all[1], all[0]]);
    expect((await wishlist()).items.map((item) => item.order)).toEqual([
      0, 1, 2, 3,
    ]);
  });

  it("«Мне это подарили» и «Отменить»; «Вернуть» из «Подарили» — в конец", async () => {
    const a = await like(0);
    const b = await like(1);
    const c = await like(2);
    const given = await api.call<WishlistItem>(
      me,
      "POST",
      `/wishlist/items/${b}/given`,
      { fromName: " Бабушка ", at: GIVEN_AT },
    );
    expect(given).toMatchObject({
      status: "given",
      given: { fromName: "Бабушка", at: GIVEN_AT },
    });
    expect((await wishlist()).wishCount).toBe(2);
    expect(
      await code(api.call(me, "POST", `/wishlist/items/${a}/given`, {})),
    ).toBe("VALIDATION");

    const undone = await api.call<WishlistItem>(
      me,
      "POST",
      `/wishlist/items/${b}/restore`,
      { undo: true },
    );
    expect(undone).toMatchObject({ status: "active", order: 1 });
    expect(undone.given).toBeUndefined();

    await api.call(me, "POST", `/wishlist/items/${b}/given`, { at: GIVEN_AT });
    const back = await api.call<WishlistItem>(
      me,
      "POST",
      `/wishlist/items/${b}/restore`,
    );
    expect(back).toMatchObject({ status: "active", order: 3 });
    expect(await ids()).toEqual([a, c, b]);
    // Активное restore не трогает.
    expect(
      await api.call<WishlistItem>(me, "POST", `/wishlist/items/${a}/restore`),
    ).toMatchObject({ status: "active", order: 0 });
  });

  it("повод, сообщение и «Не показывать мне даже это»", async () => {
    const meta = await api.call<WishlistMeta>(me, "PATCH", "/wishlist/meta", {
      occasion: { kind: "march_8", date: "1999-01-01" },
      message: "  Спасибо! ",
    });
    expect(meta).toMatchObject({
      occasion: { kind: "march_8", date: "2027-03-08" },
      message: "Спасибо!",
      hideReservationCount: false,
    });
    expect((await wishlist()).reservationCount).toBe(0);
    await api.call(me, "PATCH", "/wishlist/meta", {
      hideReservationCount: true,
      message: "",
      occasion: null,
    });
    const after = await wishlist();
    expect(after.reservationCount).toBeNull();
    expect(after.meta.message).toBeUndefined();
    expect(after.meta.occasion).toBeUndefined();
    expect(
      await code(
        api.call(me, "PATCH", "/wishlist/meta", {
          occasion: { kind: "important", dateId: "d_чужая" },
        }),
      ),
    ).toBe("VALIDATION");
    await api.call(me, "POST", "/wishlist/given-hint/dismiss");
    expect((await wishlist()).givenHintIds).toEqual([]);
  });
});
