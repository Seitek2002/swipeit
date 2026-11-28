import { describe, expect, it } from "vitest";

import type { Wishlist, WishlistItem } from "../api/wishlist/types";
import { apiErrorReason, isApiError } from "../errors";
import {
  activeCopiesOf,
  activeKeysOf,
  assertCanCreateWishlist,
  assertCanDeleteWishlist,
  assertCanRenameWishlist,
  assertCanShareWishlist,
  copyItem,
  DEFAULT_WISHLIST_NAME,
  distinctWishCount,
  findNameClash,
  findOccasionWishlist,
  findOwnWishlist,
  findTwin,
  guestListName,
  itemKeyOf,
  itemsInList,
  MAX_WISHLISTS,
  maxWishlists,
  mergeOnMove,
  multiWishlistsOff,
  ordersOnTop,
  pickFriendWishlist,
  pickSantaWishlist,
  planCopy,
  planListDeletion,
  planMove,
  reservedCountIn,
  resolveActiveWishlistId,
  resolveWishlist,
  sameWishlistName,
  showListName,
  sortWishlists,
  WISHLIST_ERRORS,
  wishlistCounts,
  wishlistCover,
  wishlistDeleted,
} from "./wishlists";

const product = (
  id: string,
  productId: string,
  extra: Partial<WishlistItem> = {},
): WishlistItem => ({
  id,
  ownerId: "u_1",
  source: { kind: "product", productId },
  priority: "normal",
  order: 0,
  status: "active",
  addedAt: "2026-11-28T10:00:00.000Z",
  ...extra,
});

const custom = (
  id: string,
  title: string,
  extra: Partial<WishlistItem> = {},
): WishlistItem => ({
  id,
  ownerId: "u_1",
  source: { kind: "custom", custom: { title } },
  priority: "normal",
  order: 0,
  status: "active",
  addedAt: "2026-11-28T10:00:00.000Z",
  ...extra,
});

const list = (
  id: string,
  name: string,
  extra: Partial<Wishlist> = {},
): Wishlist => ({
  id,
  ownerId: "u_1",
  name,
  isDefault: false,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...extra,
});

const general = list("wl_general", DEFAULT_WISHLIST_NAME, {
  isDefault: true,
  createdAt: "2026-01-01T00:00:00.000Z",
});

const errorOf = (action: () => void) => {
  try {
    action();
  } catch (error) {
    return error;
  }
  return null;
};

describe("ключ брони (spec §2.4)", () => {
  it("товар — productId, своё — custom:<id>, как раньше", () => {
    expect(itemKeyOf(product("wi_1", "p_7"))).toBe("p_7");
    expect(itemKeyOf(custom("wi_2", "Плед"))).toBe("custom:wi_2");
  });

  it("копия своего желания — ключ исходного", () => {
    const original = custom("wi_1", "Плед");
    const copy = copyItem(original, {
      id: "wi_2",
      wishlistId: "wl_ny",
      order: -1,
      addedAt: "2026-11-29T00:00:00.000Z",
    });
    expect(copy.originId).toBe("wi_1");
    expect(itemKeyOf(copy)).toBe(itemKeyOf(original));
  });

  it("копия копии → ключ оригинала", () => {
    const original = custom("wi_1", "Плед");
    const at = { order: 0, addedAt: "2026-11-29T00:00:00.000Z" };
    const copy = copyItem(original, { ...at, id: "wi_2", wishlistId: "wl_a" });
    const copyOfCopy = copyItem(copy, {
      ...at,
      id: "wi_3",
      wishlistId: "wl_b",
    });
    expect(copyOfCopy.originId).toBe("wi_1");
    expect(itemKeyOf(copyOfCopy)).toBe("custom:wi_1");
  });

  it("у копии товара originId нет: ключ — productId и так", () => {
    const copy = copyItem(product("wi_1", "p_7"), {
      id: "wi_2",
      wishlistId: "wl_ny",
      order: 0,
      addedAt: "2026-11-29T00:00:00.000Z",
    });
    expect(copy.originId).toBeUndefined();
    expect(itemKeyOf(copy)).toBe("p_7");
  });
});

describe("копия (spec §2.4)", () => {
  it("новая строка: вариант, заметка и «Очень хочу» скопированы, статус active", () => {
    const original = product("wi_1", "p_7", {
      priority: "top",
      note: "чёрные",
      variantChoice: { Цвет: "чёрный" },
      status: "given",
      given: { at: "2026-11-20T00:00:00.000Z" },
      wishlistId: "wl_general",
      order: 5,
    });
    const copy = copyItem(original, {
      id: "wi_9",
      wishlistId: "wl_ny",
      order: -3,
      addedAt: "2026-11-29T00:00:00.000Z",
    });
    expect(copy).toEqual({
      id: "wi_9",
      ownerId: "u_1",
      source: { kind: "product", productId: "p_7" },
      priority: "top",
      order: -3,
      status: "active",
      wishlistId: "wl_ny",
      addedAt: "2026-11-29T00:00:00.000Z",
      note: "чёрные",
      variantChoice: { Цвет: "чёрный" },
    });
  });

  it("копия живёт своей жизнью: правка варианта и фото не задевает оригинал", () => {
    const original = custom("wi_1", "Плед", {
      variantChoice: { Цвет: "серый" },
    });
    const copy = copyItem(original, {
      id: "wi_2",
      wishlistId: "wl_ny",
      order: 0,
      addedAt: "2026-11-29T00:00:00.000Z",
    });
    copy.variantChoice!.Цвет = "синий";
    if (copy.source.kind === "custom") copy.source.custom.title = "Другое";
    expect(original.variantChoice).toEqual({ Цвет: "серый" });
    expect(original.source).toEqual({
      kind: "custom",
      custom: { title: "Плед" },
    });
  });

  it("в вишлисте, где подарок уже есть, — alreadyThere", () => {
    const target = [product("wi_5", "p_7", { wishlistId: "wl_ny" })];
    expect(planCopy(product("wi_1", "p_7"), target)).toEqual({
      kind: "alreadyThere",
      existing: target[0],
    });
    expect(planCopy(product("wi_1", "p_8"), target)).toEqual({ kind: "copy" });
  });

  it("подаренный двойник не мешает копии: уникальность — среди активных", () => {
    const target = [product("wi_5", "p_7", { status: "given" })];
    expect(planCopy(product("wi_1", "p_7"), target)).toEqual({ kind: "copy" });
  });

  it("копия своего желания туда, где уже лежит другая копия, — alreadyThere", () => {
    const original = custom("wi_1", "Плед");
    const target = [custom("wi_2", "Плед", { originId: "wi_1" })];
    expect(planCopy(original, target).kind).toBe("alreadyThere");
    // Своё желание с тем же названием, но не копия — другой подарок.
    expect(planCopy(custom("wi_3", "Плед"), target).kind).toBe("copy");
  });
});

describe("перемещение и слияние (spec §2.4)", () => {
  it("в другой вишлист без двойника — move", () => {
    const moving = product("wi_1", "p_7", { wishlistId: "wl_general" });
    expect(planMove(moving, "wl_ny", [], "wl_general")).toEqual({
      kind: "move",
    });
  });

  it("в свой же вишлист — stay; без wishlistId строка в «Общем»", () => {
    const moving = product("wi_1", "p_7");
    expect(planMove(moving, "wl_general", [], "wl_general")).toEqual({
      kind: "stay",
    });
  });

  it("двойник в цели — merge в строку цели", () => {
    const twin = product("wi_5", "p_7", { wishlistId: "wl_ny" });
    const moving = product("wi_1", "p_7", { wishlistId: "wl_general" });
    expect(planMove(moving, "wl_ny", [twin], "wl_general")).toEqual({
      kind: "merge",
      target: twin,
    });
  });

  it("подаренное двойника не ищет", () => {
    const twin = product("wi_5", "p_7", { wishlistId: "wl_ny" });
    const moving = product("wi_1", "p_7", { status: "given" });
    expect(planMove(moving, "wl_ny", [twin], "wl_general").kind).toBe("move");
  });

  it("слияние: «Очень хочу» с любой строки, заметка и вариант — у цели", () => {
    const target = product("wi_5", "p_7", {
      note: "к ДР",
      variantChoice: { Цвет: "белый" },
      wishlistId: "wl_ny",
      order: 3,
    });
    const moving = product("wi_1", "p_7", {
      priority: "top",
      note: "чёрные",
      variantChoice: { Цвет: "чёрный" },
    });
    expect(mergeOnMove(target, moving)).toEqual({ ...target, priority: "top" });
  });

  it("слияние: у цели пусто — заметка и вариант от перемещаемой", () => {
    const target = product("wi_5", "p_7", { note: "  ", variantChoice: {} });
    const moving = product("wi_1", "p_7", {
      note: "чёрные",
      variantChoice: { Цвет: "чёрный" },
    });
    const merged = mergeOnMove(target, moving);
    expect(merged.id).toBe("wi_5");
    expect(merged.priority).toBe("normal");
    expect(merged.note).toBe("чёрные");
    expect(merged.variantChoice).toEqual({ Цвет: "чёрный" });
    // Исходные строки не меняются.
    expect(target.note).toBe("  ");
  });

  it("новые наверх, в прежнем порядке", () => {
    expect(ordersOnTop([], 1)).toEqual([0]);
    expect(ordersOnTop([0, 1, 2], 3)).toEqual([-3, -2, -1]);
    expect(ordersOnTop([-4, 2], 2)).toEqual([-6, -5]);
    expect(ordersOnTop([5], 0)).toEqual([]);
  });
});

describe("удаление вишлиста (spec §2.7)", () => {
  it("всё переезжает в «Общий», активные двойники сливаются, подаренные — нет", () => {
    const defaultItems = [
      product("wi_10", "p_1"),
      product("wi_11", "p_2", { status: "given" }),
      custom("wi_12", "Плед"),
    ];
    const deleted = [
      product("wi_3", "p_9", { order: 2 }),
      product("wi_1", "p_1", { order: 0 }),
      product("wi_2", "p_2", { order: 1 }),
      custom("wi_4", "Плед", { originId: "wi_12", order: 3 }),
      product("wi_5", "p_1", { status: "given", order: 4 }),
    ];
    expect(planListDeletion(deleted, defaultItems)).toEqual({
      merges: [
        { movingId: "wi_1", targetId: "wi_10" },
        { movingId: "wi_4", targetId: "wi_12" },
      ],
      moves: ["wi_2", "wi_3", "wi_5"],
    });
  });
});

describe("подсчёты (spec §2.8)", () => {
  const items = [
    product("wi_1", "p_1"),
    product("wi_2", "p_2"),
    custom("wi_3", "Плед"),
    product("wi_4", "p_1", { wishlistId: "wl_ny" }),
    custom("wi_5", "Плед", { originId: "wi_3", wishlistId: "wl_ny" }),
    product("wi_6", "p_3", { status: "given" }),
  ];

  it("3 желания + 2 копии → 3 разных подарка: копия порог не накручивает", () => {
    expect(distinctWishCount(items)).toBe(3);
    expect(activeKeysOf(items)).toEqual(new Set(["p_1", "p_2", "custom:wi_3"]));
  });

  it("все активные копии подарка — во всех вишлистах", () => {
    expect(activeCopiesOf(items, "p_1").map((item) => item.id)).toEqual([
      "wi_1",
      "wi_4",
    ]);
    expect(activeCopiesOf(items, "custom:wi_3").map((item) => item.id)).toEqual(
      ["wi_3", "wi_5"],
    );
    expect(activeCopiesOf(items, "p_3")).toEqual([]);
  });

  it("строки вишлиста: без wishlistId — в «Общем»", () => {
    expect(
      itemsInList(items, "wl_general", "wl_general").map((item) => item.id),
    ).toEqual(["wi_1", "wi_2", "wi_3", "wi_6"]);
    expect(
      itemsInList(items, "wl_ny", "wl_general").map((item) => item.id),
    ).toEqual(["wi_4", "wi_5"]);
  });

  it("брони — по открытому вишлисту, разные ключи", () => {
    const ny = itemsInList(items, "wl_ny", "wl_general");
    expect(reservedCountIn(ny, new Set(["p_1", "p_2"]))).toBe(1);
    expect(reservedCountIn(items, new Set(["p_1", "p_3", "custom:wi_3"]))).toBe(
      2,
    );
  });

  it("двойник в вишлисте — по ключу, кроме самой строки", () => {
    const ny = itemsInList(items, "wl_ny", "wl_general");
    expect(findTwin(ny, "p_1")?.id).toBe("wi_4");
    expect(findTwin(ny, "p_1", "wi_4")).toBeUndefined();
  });

  it("счётчики и обложка вишлиста", () => {
    const listItems = [
      custom("wi_1", "Без фото", { order: 0 }),
      product("wi_2", "p_2", { order: 4 }),
      custom("wi_3", "С фото", { order: 1 }),
      product("wi_4", "p_4", { order: 2, status: "given" }),
      product("wi_5", "p_5", { order: 5 }),
      product("wi_6", "p_6", { order: 6 }),
      product("wi_7", "p_7", { order: 7 }),
    ];
    if (listItems[2]!.source.kind === "custom") {
      listItems[2]!.source.custom.imageKey = "img_1";
    }
    expect(wishlistCounts(listItems)).toEqual({
      activeCount: 6,
      givenCount: 1,
    });
    expect(wishlistCover(listItems)).toEqual([
      { imageKey: "img_1" },
      { productId: "p_2" },
      { productId: "p_5" },
      { productId: "p_6" },
    ]);
  });
});

describe("Санта: вишлист по умолчанию (spec §2.9)", () => {
  it("«Новый год» по поводу важнее, чем по названию", () => {
    const byName = list("wl_a", "Новый год", {
      createdAt: "2026-11-20T00:00:00.000Z",
    });
    const byOccasion = list("wl_b", "Праздники", {
      occasion: { kind: "new_year", date: "2026-12-31" },
      createdAt: "2026-11-10T00:00:00.000Z",
    });
    expect(pickSantaWishlist([general, byName, byOccasion])?.id).toBe("wl_b");
  });

  it("по названию — без учёта регистра и пробелов по краям", () => {
    const byName = list("wl_a", "  новый ГОД ");
    expect(pickSantaWishlist([general, byName])?.id).toBe("wl_a");
  });

  it("иначе — «Общий», даже переименованный", () => {
    const renamed = { ...general, name: "Всё подряд" };
    expect(pickSantaWishlist([list("wl_a", "Для дома"), renamed])?.id).toBe(
      "wl_general",
    );
  });

  it("из нескольких подходящих — самый новый", () => {
    const older = list("wl_a", "НГ дома", {
      occasion: { kind: "new_year" },
      createdAt: "2026-11-01T00:00:00.000Z",
    });
    const newer = list("wl_b", "НГ офис", {
      occasion: { kind: "new_year" },
      createdAt: "2026-11-15T00:00:00.000Z",
    });
    expect(pickSantaWishlist([general, newer, older])?.id).toBe("wl_b");
    expect(pickSantaWishlist([])).toBeUndefined();
  });
});

describe("друг: какой вишлист открыть (spec §2.10)", () => {
  it("с ближайшей датой повода, прошедшие не в счёт", () => {
    const lists = [
      general,
      list("wl_past", "Прошлое", {
        occasion: { kind: "birthday", date: "2026-11-01" },
      }),
      list("wl_ny", "Новый год", {
        occasion: { kind: "new_year", date: "2026-12-31" },
      }),
      list("wl_bd", "ДР", {
        occasion: { kind: "birthday", date: "2026-12-05" },
      }),
    ];
    expect(pickFriendWishlist(lists, "2026-11-28")?.id).toBe("wl_bd");
    expect(pickFriendWishlist(lists, "2026-12-05")?.id).toBe("wl_bd");
    expect(pickFriendWishlist(lists, "2026-12-06")?.id).toBe("wl_ny");
  });

  it("без дат — «Общий»; «Общего» среди непустых нет — первый", () => {
    const dateless = list("wl_a", "Для дома", {
      occasion: { kind: "just_because" },
    });
    expect(pickFriendWishlist([dateless, general], "2026-11-28")?.id).toBe(
      "wl_general",
    );
    expect(pickFriendWishlist([dateless], "2026-11-28")?.id).toBe("wl_a");
    expect(pickFriendWishlist([], "2026-11-28")).toBeUndefined();
  });

  it("вишлист к поводу — самый новый с этим поводом", () => {
    const lists = [
      general,
      list("wl_bd", "ДР", { occasion: { kind: "birthday" } }),
      list("wl_ny", "НГ", { occasion: { kind: "new_year" } }),
    ];
    expect(findOccasionWishlist(lists, "birthday")?.id).toBe("wl_bd");
    expect(findOccasionWishlist(lists, "march_8")).toBeUndefined();
  });
});

describe("название для гостя (spec §2.2, §4.7)", () => {
  it("«Общий» без названия, переименованный и свои — с названием", () => {
    expect(showListName(general)).toBe(false);
    expect(showListName({ ...general, name: "Всё подряд" })).toBe(true);
    expect(showListName(list("wl_a", "День рождения"))).toBe(true);
    // Не «Общий», но с таким названием (настоящий переименовали).
    expect(showListName(list("wl_b", DEFAULT_WISHLIST_NAME))).toBe(true);
    expect(guestListName(general)).toBeUndefined();
    expect(guestListName(list("wl_a", "ДР"))).toBe("ДР");
  });
});

describe("вишлисты человека: названия, лимит, главный", () => {
  it("название уникально без учёта регистра", () => {
    expect(sameWishlistName("День рождения", "  день РОЖДЕНИЯ ")).toBe(true);
    expect(sameWishlistName("Новый год", "Новый год 2027")).toBe(false);
    const lists = [general, list("wl_a", "День рождения")];
    expect(findNameClash(lists, "общий")?.id).toBe("wl_general");
    expect(findNameClash(lists, "день рождения", "wl_a")).toBeUndefined();
  });

  it("создание: повтор названия → VALIDATION", () => {
    const error = errorOf(() =>
      assertCanCreateWishlist([general], "ОБЩИЙ", { enabled: true }),
    );
    expect(isApiError(error) && error.code).toBe("VALIDATION");
    expect((error as Error).message).toBe(WISHLIST_ERRORS.nameTaken);
    expect(() =>
      assertCanCreateWishlist([general], "Новый год", { enabled: true }),
    ).not.toThrow();
  });

  it("11-й → VALIDATION «Можно до 10 вишлистов»", () => {
    const lists = [
      general,
      ...Array.from({ length: MAX_WISHLISTS - 1 }, (_, index) =>
        list(`wl_${index}`, `Список ${index}`),
      ),
    ];
    expect(lists).toHaveLength(10);
    const error = errorOf(() =>
      assertCanCreateWishlist(lists, "Ещё один", { enabled: true }),
    );
    expect(isApiError(error) && error.code).toBe("VALIDATION");
    expect((error as Error).message).toBe("Можно до 10 вишлистов");
    expect(() =>
      assertCanCreateWishlist(lists.slice(0, 9), "Ещё один", { enabled: true }),
    ).not.toThrow();
  });

  it("флаг выключен: второй вишлист не создаётся (FORBIDDEN, причина)", () => {
    expect(maxWishlists(false)).toBe(1);
    expect(maxWishlists(true)).toBe(MAX_WISHLISTS);
    const error = errorOf(() =>
      assertCanCreateWishlist([general], "Новый год", { enabled: false }),
    );
    expect(isApiError(error) && error.code).toBe("FORBIDDEN");
    expect(apiErrorReason(error)).toBe("MULTI_WISHLISTS_OFF");
    expect(apiErrorReason(multiWishlistsOff())).toBe("MULTI_WISHLISTS_OFF");
  });

  it("переименование: своё название в другом регистре можно, чужое — нет", () => {
    const lists = [general, list("wl_a", "День рождения")];
    expect(() =>
      assertCanRenameWishlist(lists, "wl_a", "ДЕНЬ РОЖДЕНИЯ"),
    ).not.toThrow();
    expect(() => assertCanRenameWishlist(lists, "wl_a", "Общий")).toThrow(
      WISHLIST_ERRORS.nameTaken,
    );
  });

  it("«Общий» не удаляется (FORBIDDEN), свой — можно", () => {
    const error = errorOf(() => assertCanDeleteWishlist(general));
    expect(isApiError(error) && error.code).toBe("FORBIDDEN");
    expect((error as Error).message).toBe("„Общий“ удалить нельзя");
    expect(() => assertCanDeleteWishlist(list("wl_a", "ДР"))).not.toThrow();
  });

  it("пустой вишлист не отправить", () => {
    expect(() => assertCanShareWishlist(0)).toThrow(WISHLIST_ERRORS.empty);
    expect(() => assertCanShareWishlist(1)).not.toThrow();
  });

  it("главный: сохранённый, а удалён или пусто — «Общий»", () => {
    const lists = [general, list("wl_a", "ДР")];
    expect(resolveActiveWishlistId(lists, "wl_a")).toBe("wl_a");
    expect(resolveActiveWishlistId(lists, "wl_deleted")).toBe("wl_general");
    expect(resolveActiveWishlistId(lists, undefined)).toBe("wl_general");
    expect(resolveActiveWishlistId([], undefined)).toBeUndefined();
  });

  it("вишлист запроса: явный свой, чужой — NOT_FOUND, без id — главный", () => {
    const lists = [general, list("wl_a", "ДР")];
    expect(resolveWishlist(lists, "wl_a", undefined).id).toBe("wl_a");
    expect(resolveWishlist(lists, undefined, "wl_a").id).toBe("wl_a");
    expect(resolveWishlist(lists, undefined, undefined).id).toBe("wl_general");
    const error = errorOf(() => resolveWishlist(lists, "wl_alien", "wl_a"));
    expect(isApiError(error) && error.code).toBe("NOT_FOUND");
    expect((error as Error).message).toBe("Вишлист не найден");
    expect(() => findOwnWishlist([], "wl_a")).toThrow("Вишлист не найден");
    expect(() => resolveWishlist([], undefined, undefined)).toThrow(
      "Вишлист не найден",
    );
  });

  it("ряд: «Общий» первым, дальше по созданию", () => {
    const later = list("wl_b", "Б", { createdAt: "2026-11-20T00:00:00.000Z" });
    const earlier = list("wl_a", "А", {
      createdAt: "2026-11-10T00:00:00.000Z",
    });
    const lateGeneral = { ...general, createdAt: "2026-12-01T00:00:00.000Z" };
    expect(
      sortWishlists([later, lateGeneral, earlier]).map((entry) => entry.id),
    ).toEqual(["wl_general", "wl_a", "wl_b"]);
  });

  it("удалённый вишлист — NOT_FOUND с причиной WISHLIST_DELETED", () => {
    const error = wishlistDeleted();
    expect(error.status).toBe(404);
    expect(error.code).toBe("NOT_FOUND");
    expect(error.message).toBe("Этот вишлист удалили");
    expect(apiErrorReason(error)).toBe("WISHLIST_DELETED");
    // Ошибка, пришедшая по сети объектом, — та же причина.
    expect(
      apiErrorReason({
        name: "ApiError",
        code: "NOT_FOUND",
        reason: "WISHLIST_DELETED",
      }),
    ).toBe("WISHLIST_DELETED");
    expect(
      apiErrorReason({ name: "ApiError", code: "NOT_FOUND", reason: "x" }),
    ).toBe(undefined);
  });
});
