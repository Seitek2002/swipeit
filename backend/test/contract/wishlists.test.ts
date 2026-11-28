import type { Product } from "@swipeit/core/api/catalog/types";
import type {
  DeleteWishlistResponse,
  SwipeResponse,
  Wishlist,
  WishlistMeta,
  WishlistResponse,
  WishlistsResponse,
} from "@swipeit/core/api/wishlist/types";
import { type ApiError, isApiError } from "@swipeit/core/errors";
import {
  DEFAULT_WISHLIST_NAME,
  MAX_WISHLISTS,
  WISHLIST_ERRORS,
} from "@swipeit/core/logic/wishlists";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type ApiClient,
  type Caller,
  CLIENTS,
  NOW,
  testCatalog,
} from "./client";

// Несколько вишлистов: CRUD и главный (spec-multi-wishlists L04) — один
// сценарий на моке и на сервере. Перемещение, копия и «Подарили» по копиям
// — L05.

const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => null,
    (error: unknown) => (isApiError(error) ? (error as ApiError) : null),
  );

describe.each(CLIENTS)("несколько вишлистов — %s", (_name, create) => {
  let api: ApiClient;
  let me: Caller;
  let products: readonly Product[];
  beforeEach(async () => {
    api = await create();
    ({ caller: me } = await api.newUser());
    ({ products } = await testCatalog());
  });
  afterEach(() => api.close());

  const lists = (caller = me) =>
    api.call<WishlistsResponse>(caller, "GET", "/wishlists");
  const createList = (body: Record<string, unknown>, caller = me) =>
    api.call<Wishlist>(caller, "POST", "/wishlists", body);
  const wishlist = (list?: string, caller = me) =>
    api.call<WishlistResponse>(
      caller,
      "GET",
      "/wishlist",
      undefined,
      list ? { list } : undefined,
    );
  const like = async (index: number) =>
    (
      await api.call<SwipeResponse>(me, "POST", "/swipes", {
        productId: products[index]?.id,
        decision: "like",
        context: { kind: "self" },
      })
    ).wishlistItemId ?? "";

  it("новый профиль — один «Общий», он же главный; GET /wishlist отдаёт его", async () => {
    const view = await lists();
    expect(view.lists).toEqual([
      {
        id: view.activeId,
        name: DEFAULT_WISHLIST_NAME,
        isDefault: true,
        activeCount: 0,
        givenCount: 0,
        cover: [],
      },
    ]);
    const own = await wishlist();
    expect(own.wishlist).toMatchObject({
      id: view.activeId,
      name: DEFAULT_WISHLIST_NAME,
      isDefault: true,
      ownerId: me.id,
    });
  });

  it("создать и переименовать: новый — в конце ряда; «Общий» тоже переименовывается и остаётся «Общим»", async () => {
    const birthday = await createList({ name: "  День рождения  " });
    expect(birthday).toMatchObject({
      name: "День рождения",
      isDefault: false,
      ownerId: me.id,
      createdAt: new Date(NOW).toISOString(),
    });
    expect(birthday.id).toMatch(/^wl_/);
    const home = await createList({ name: "Для дома" });
    const view = await lists();
    expect(view.lists.map((list) => list.name)).toEqual([
      DEFAULT_WISHLIST_NAME,
      "День рождения",
      "Для дома",
    ]);
    // Без makeActive главный не меняется.
    expect(view.activeId).toBe(view.lists[0]?.id);

    const renamed = await api.call<Wishlist>(
      me,
      "PATCH",
      `/wishlists/${home.id}`,
      { name: "Новоселье" },
    );
    expect(renamed).toMatchObject({ id: home.id, name: "Новоселье" });
    const defaultId = view.lists[0]?.id ?? "";
    const main = await api.call<Wishlist>(
      me,
      "PATCH",
      `/wishlists/${defaultId}`,
      { name: "Всё подряд" },
    );
    expect(main).toMatchObject({ name: "Всё подряд", isDefault: true });
    expect((await lists()).lists.map((list) => list.name)).toEqual([
      "Всё подряд",
      "День рождения",
      "Новоселье",
    ]);
    // Своё же название в другом регистре — можно.
    expect(
      (
        await api.call<Wishlist>(me, "PATCH", `/wishlists/${home.id}`, {
          name: "НОВОСЕЛЬЕ",
        })
      ).name,
    ).toBe("НОВОСЕЛЬЕ");
  });

  it("повтор названия без учёта регистра и пробелов — VALIDATION; пустое и 41 символ — VALIDATION", async () => {
    const first = await createList({ name: "Новый год" });
    const twin = await failure(createList({ name: " новый ГОД " }));
    expect(twin).toMatchObject({
      code: "VALIDATION",
      message: WISHLIST_ERRORS.nameTaken,
    });
    const other = await createList({ name: "8 Марта" });
    const rename = await failure(
      api.call(me, "PATCH", `/wishlists/${other.id}`, { name: "НОВЫЙ год" }),
    );
    expect(rename).toMatchObject({ code: "VALIDATION" });
    // «Общий» тоже занят как название.
    expect(await failure(createList({ name: "общий" }))).toMatchObject({
      code: "VALIDATION",
    });
    expect(await failure(createList({ name: "   " }))).toMatchObject({
      code: "VALIDATION",
      message: "Назови вишлист",
    });
    expect(await failure(createList({ name: "я".repeat(41) }))).toMatchObject({
      code: "VALIDATION",
    });
    expect((await lists()).lists.map((list) => list.id)).toContain(first.id);
  });

  it(`до ${MAX_WISHLISTS} вишлистов: ${MAX_WISHLISTS + 1}-й — VALIDATION «Можно до ${MAX_WISHLISTS} вишлистов»`, async () => {
    for (let index = 1; index < MAX_WISHLISTS; index += 1) {
      await createList({ name: `Вишлист ${index}` });
    }
    expect((await lists()).lists).toHaveLength(MAX_WISHLISTS);
    expect(await failure(createList({ name: "Лишний" }))).toMatchObject({
      code: "VALIDATION",
      message: WISHLIST_ERRORS.limit,
    });
  });

  it("«Общий» не удаляется — FORBIDDEN", async () => {
    const { lists: [main] = [] } = await lists();
    expect(
      await failure(api.call(me, "DELETE", `/wishlists/${main?.id}`)),
    ).toMatchObject({
      code: "FORBIDDEN",
      message: WISHLIST_ERRORS.keepDefault,
    });
    expect((await lists()).lists).toHaveLength(1);
  });

  it("чужой и несуществующий вишлист — NOT_FOUND «Вишлист не найден»", async () => {
    const { caller: other } = await api.newUser();
    const theirs = await createList({ name: "Секрет" }, other);
    const notFound = {
      code: "NOT_FOUND",
      message: WISHLIST_ERRORS.notFound,
    };
    // По очереди: запрос уходит, только когда до него дошли.
    for (const request of [
      () => api.call(me, "PATCH", `/wishlists/${theirs.id}`, { name: "Моё" }),
      () => api.call(me, "DELETE", `/wishlists/${theirs.id}`),
      () => api.call(me, "POST", `/wishlists/${theirs.id}/activate`),
      () => wishlist(theirs.id),
      () =>
        api.call(me, "PATCH", "/wishlist/meta", {
          wishlistId: theirs.id,
          message: "Чужое",
        }),
      () => api.call(me, "POST", "/wishlists/wl_nope/activate"),
    ]) {
      expect(await failure(request())).toMatchObject(notFound);
    }
    // Чужой вишлист не тронут.
    expect((await lists(other)).lists.map((list) => list.name)).toEqual([
      DEFAULT_WISHLIST_NAME,
      "Секрет",
    ]);
  });

  it("activate меняет activeId; «Хочу» летит в главный; GET /wishlist без list — главный", async () => {
    const birthday = await createList({ name: "День рождения" });
    const activated = await api.call<WishlistsResponse>(
      me,
      "POST",
      `/wishlists/${birthday.id}/activate`,
    );
    expect(activated.activeId).toBe(birthday.id);
    expect((await lists()).activeId).toBe(birthday.id);

    const itemId = await like(0);
    const main = await wishlist();
    expect(main.wishlist?.id).toBe(birthday.id);
    expect(main.items.map((item) => item.id)).toEqual([itemId]);
    expect(main.items[0]?.wishlistId).toBe(birthday.id);
    const defaultId = activated.lists[0]?.id ?? "";
    expect((await wishlist(defaultId)).items).toEqual([]);
    const row = (await lists()).lists.find((list) => list.id === birthday.id);
    expect(row).toMatchObject({
      activeCount: 1,
      givenCount: 0,
      cover: [{ productId: products[0]?.id }],
    });
    // wishCount — по человеку.
    expect((await wishlist(defaultId)).wishCount).toBe(1);
  });

  it("создать с makeActive — сразу главный", async () => {
    const created = await createList({ name: "Новый год", makeActive: true });
    expect((await lists()).activeId).toBe(created.id);
  });

  it("удалили главный — главный «Общий», желания переехали в «Общий»", async () => {
    const birthday = await createList({
      name: "День рождения",
      makeActive: true,
    });
    await like(0);
    await like(1);
    const response = await api.call<DeleteWishlistResponse>(
      me,
      "DELETE",
      `/wishlists/${birthday.id}`,
    );
    expect(response).toEqual({ movedCount: 2 });
    const view = await lists();
    expect(view.lists).toHaveLength(1);
    expect(view.activeId).toBe(view.lists[0]?.id);
    const main = await wishlist();
    expect(main.wishlist?.isDefault).toBe(true);
    expect(main.items.map((item) => item.source)).toEqual([
      { kind: "product", productId: products[1]?.id },
      { kind: "product", productId: products[0]?.id },
    ]);
    expect(await failure(wishlist(birthday.id))).toMatchObject({
      code: "NOT_FOUND",
    });
  });

  it("повод, сообщение и подсказка — у каждого вишлиста свои; «Не показывать мне даже это» — у человека", async () => {
    const newYear = await createList({ name: "Новый год" });
    const march = await createList({
      name: "8 Марта",
      occasion: { kind: "march_8" },
    });
    expect(march.occasion?.kind).toBe("march_8");
    const meta = await api.call<WishlistMeta>(me, "PATCH", "/wishlist/meta", {
      wishlistId: newYear.id,
      occasion: { kind: "new_year" },
      message: "К празднику",
      hideReservationCount: true,
    });
    expect(meta).toMatchObject({
      occasion: { kind: "new_year" },
      message: "К празднику",
      hideReservationCount: true,
    });
    const ny = await wishlist(newYear.id);
    expect(ny.meta).toMatchObject({
      occasion: { kind: "new_year" },
      message: "К празднику",
      hideReservationCount: true,
    });
    expect(ny.wishlist?.occasion?.kind).toBe("new_year");
    const m8 = await wishlist(march.id);
    expect(m8.meta.occasion?.kind).toBe("march_8");
    expect(m8.meta.message).toBeUndefined();
    expect(m8.meta.hideReservationCount).toBe(true);
    // «Общий» (главный) — без повода: правка другого его не трогает.
    const main = await wishlist();
    expect(main.wishlist?.isDefault).toBe(true);
    expect(main.meta.occasion).toBeUndefined();
    // Без wishlistId — главный.
    await api.call(me, "PATCH", "/wishlist/meta", { message: "Главному" });
    expect((await wishlist()).meta.message).toBe("Главному");
    expect((await wishlist(newYear.id)).meta.message).toBe("К празднику");
    const row = (await lists()).lists.find((list) => list.id === newYear.id);
    expect(row?.occasion?.kind).toBe("new_year");
  });

  it("с одним «Общим» GET /wishlist, повод и «Хочу» — как раньше", async () => {
    const itemId = await like(2);
    await api.call(me, "PATCH", "/wishlist/meta", {
      occasion: { kind: "new_year" },
    });
    const own = await wishlist();
    expect(own.items.map((item) => item.id)).toEqual([itemId]);
    expect(own.meta.occasion?.kind).toBe("new_year");
    expect(own.wishCount).toBe(1);
    expect(own.reservationCount).toBe(0);
  });
});

describe.each(CLIENTS)(
  "несколько вишлистов выключены флагом — %s",
  (_name, create) => {
    let api: ApiClient;
    let me: Caller;
    beforeEach(async () => {
      api = await create(NOW, { multiWishlists: false });
      ({ caller: me } = await api.newUser());
    });
    afterEach(() => api.close());

    it("второй вишлист не создаётся: FORBIDDEN с причиной MULTI_WISHLISTS_OFF; «Общий» на месте", async () => {
      const error = await failure(
        api.call(me, "POST", "/wishlists", { name: "День рождения" }),
      );
      expect(error).toMatchObject({
        code: "FORBIDDEN",
        reason: "MULTI_WISHLISTS_OFF",
        message: WISHLIST_ERRORS.featureOff,
      });
      const view = await api.call<WishlistsResponse>(me, "GET", "/wishlists");
      expect(view.lists.map((list) => list.name)).toEqual([
        DEFAULT_WISHLIST_NAME,
      ]);
      expect(view.activeId).toBe(view.lists[0]?.id);
    });

    it("свой вишлист работает как раньше: повод, сообщение, GET /wishlist", async () => {
      await api.call(me, "PATCH", "/wishlist/meta", {
        occasion: { kind: "new_year" },
        message: "Привет",
      });
      const own = await api.call<WishlistResponse>(me, "GET", "/wishlist");
      expect(own.meta).toMatchObject({
        occasion: { kind: "new_year" },
        message: "Привет",
      });
      expect(own.wishlist).toMatchObject({
        name: DEFAULT_WISHLIST_NAME,
        isDefault: true,
      });
      expect(own.items).toEqual([]);
    });
  },
);
