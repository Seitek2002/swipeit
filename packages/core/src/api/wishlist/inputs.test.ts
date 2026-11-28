import { describe, expect, it } from "vitest";

import { parseInput } from "../../parse-input";
import {
  CreateSantaInputSchema,
  JoinSantaInputSchema,
  SantaWishlistInputSchema,
} from "../santa/types";
import {
  CopyItemInputSchema,
  CreateWishlistInputSchema,
  CustomWishInputSchema,
  MetaPatchInputSchema,
  MoveItemInputSchema,
  PatchWishlistInputSchema,
  ReorderInputSchema,
  ShareWishlistInputSchema,
  WishlistNameSchema,
  WishlistQueryInputSchema,
  WishlistTargetInputSchema,
} from "./inputs";
import {
  ExternalWishlistSchema,
  SwipeInputSchema,
  WishlistItemSchema,
  WishlistSchema,
} from "./types";

const messageOf = (action: () => unknown) => {
  try {
    action();
  } catch (error) {
    return (error as Error).message;
  }
  return null;
};

describe("тела запросов нескольких вишлистов (spec §3.1)", () => {
  it("название: trim, 1–40, понятные ошибки", () => {
    expect(parseInput(WishlistNameSchema, "  Новоселье ")).toBe("Новоселье");
    expect(messageOf(() => parseInput(WishlistNameSchema, "   "))).toBe(
      "Назови вишлист",
    );
    expect(messageOf(() => parseInput(WishlistNameSchema, undefined))).toBe(
      "Назови вишлист",
    );
    expect(parseInput(WishlistNameSchema, "я".repeat(40))).toHaveLength(40);
    expect(
      messageOf(() => parseInput(WishlistNameSchema, "я".repeat(41))),
    ).toBe("Название — до 40 символов");
  });

  it("создание: название, повод, makeActive", () => {
    expect(
      parseInput(CreateWishlistInputSchema, {
        name: " Новый год ",
        occasion: { kind: "new_year" },
        makeActive: true,
      }),
    ).toEqual({
      name: "Новый год",
      occasion: { kind: "new_year" },
      makeActive: true,
    });
    expect(parseInput(CreateWishlistInputSchema, { name: "Для дома" })).toEqual(
      {
        name: "Для дома",
      },
    );
    expect(
      messageOf(() =>
        parseInput(CreateWishlistInputSchema, {
          name: "Годовщина",
          occasion: { kind: "important" },
        }),
      ),
    ).toBe("Выбери дату");
  });

  it("переименование — name необязателен, но не пустой", () => {
    expect(parseInput(PatchWishlistInputSchema, {})).toEqual({});
    expect(
      messageOf(() => parseInput(PatchWishlistInputSchema, { name: "" })),
    ).toBe("Назови вишлист");
  });

  it("перемещение и копия — нужен вишлист; order — только число", () => {
    expect(
      parseInput(MoveItemInputSchema, { wishlistId: "wl_1", order: -2 }),
    ).toEqual({ wishlistId: "wl_1", order: -2 });
    expect(messageOf(() => parseInput(MoveItemInputSchema, {}))).toBe(
      "Выбери вишлист",
    );
    expect(
      messageOf(() =>
        parseInput(MoveItemInputSchema, {
          wishlistId: "wl_1",
          order: Infinity,
        }),
      ),
    ).not.toBeNull();
    expect(
      messageOf(() => parseInput(CopyItemInputSchema, { wishlistId: "" })),
    ).toBe("Выбери вишлист");
    expect(
      messageOf(() =>
        parseInput(CopyItemInputSchema, { wishlistId: "x".repeat(41) }),
      ),
    ).toBe("Вишлист не найден");
  });

  it("отправка — без wishlistId нельзя", () => {
    expect(messageOf(() => parseInput(ShareWishlistInputSchema, {}))).toBe(
      "Выбери вишлист",
    );
    expect(
      parseInput(ShareWishlistInputSchema, { wishlistId: "wl_1" }),
    ).toEqual({
      wishlistId: "wl_1",
    });
  });

  it("старые тела без wishlistId читаются как раньше (главный)", () => {
    expect(parseInput(ReorderInputSchema, { ids: ["wi_1"] })).toEqual({
      ids: ["wi_1"],
    });
    expect(parseInput(MetaPatchInputSchema, { message: " Привет " })).toEqual({
      message: "Привет",
    });
    expect(parseInput(WishlistTargetInputSchema, {})).toEqual({});
    expect(parseInput(WishlistQueryInputSchema, {})).toEqual({});
    expect(
      parseInput(ReorderInputSchema, { ids: [], wishlistId: "wl_1" })
        .wishlistId,
    ).toBe("wl_1");
    expect(parseInput(WishlistQueryInputSchema, { list: "wl_1" })).toEqual({
      list: "wl_1",
    });
  });

  it("своё желание: wishlistId не попадает в custom", () => {
    const body = { title: "Плед", wishlistId: "wl_1" };
    expect(parseInput(CustomWishInputSchema, body)).toEqual({ title: "Плед" });
    expect(parseInput(WishlistTargetInputSchema, body)).toEqual({
      wishlistId: "wl_1",
    });
  });

  it("свайп: wishlistId — только в своей ленте", () => {
    const base = { productId: "p_1", decision: "like" };
    expect(
      parseInput(SwipeInputSchema, {
        ...base,
        context: { kind: "self" },
        wishlistId: "wl_1",
      }).wishlistId,
    ).toBe("wl_1");
    expect(
      parseInput(SwipeInputSchema, { ...base, context: { kind: "self" } }),
    ).toEqual({ ...base, context: { kind: "self" } });
    expect(
      messageOf(() =>
        parseInput(SwipeInputSchema, {
          ...base,
          context: { kind: "pick", requestId: "pr_1" },
          wishlistId: "wl_1",
        }),
      ),
    ).toBe("Вишлист выбирают только в своей ленте");
  });

  it("Санта: вишлист при создании и вступлении необязателен, при смене — нужен", () => {
    expect(parseInput(JoinSantaInputSchema, {})).toEqual({});
    expect(parseInput(JoinSantaInputSchema, { wishlistId: "wl_1" })).toEqual({
      wishlistId: "wl_1",
    });
    expect(messageOf(() => parseInput(SantaWishlistInputSchema, {}))).toBe(
      "Выбери вишлист",
    );
    const game = {
      title: "Офис",
      budget: 2000,
      exchangeDate: "2026-12-25",
      participantIds: [],
    };
    expect(parseInput(CreateSantaInputSchema, game).wishlistId).toBeUndefined();
    expect(
      parseInput(CreateSantaInputSchema, { ...game, wishlistId: "wl_1" })
        .wishlistId,
    ).toBe("wl_1");
  });
});

describe("схемы данных (spec §3.1)", () => {
  it("вишлист: название 1–40", () => {
    const list = {
      id: "wl_1",
      ownerId: "u_1",
      name: "День рождения",
      isDefault: false,
      createdAt: "2026-11-28T00:00:00.000Z",
    };
    expect(WishlistSchema.parse(list)).toEqual(list);
    expect(WishlistSchema.safeParse({ ...list, name: "" }).success).toBe(false);
    expect(
      WishlistSchema.safeParse({ ...list, name: "я".repeat(41) }).success,
    ).toBe(false);
  });

  it("старое желание без wishlistId и originId читается", () => {
    const item = {
      id: "wi_1",
      ownerId: "u_1",
      source: { kind: "product", productId: "p_1" },
      priority: "normal",
      order: 0,
      status: "active",
      addedAt: "2026-11-28T00:00:00.000Z",
    };
    expect(WishlistItemSchema.parse(item)).toEqual(item);
    const copy = { ...item, wishlistId: "wl_1", originId: "wi_0" };
    expect(WishlistItemSchema.parse(copy)).toEqual(copy);
  });

  it("снимок: название вишлиста необязательно, до 40", () => {
    const snapshot = {
      id: "ew_1",
      owner: { name: "Дана", avatarColor: "rose" },
      meta: {},
      items: [],
      openedAt: "2026-11-28T00:00:00.000Z",
    };
    const parsed = ExternalWishlistSchema.safeParse(snapshot);
    expect(parsed.success).toBe(true);
    expect(
      ExternalWishlistSchema.parse({ ...snapshot, meta: { listName: "ДР" } })
        .meta.listName,
    ).toBe("ДР");
    expect(
      ExternalWishlistSchema.safeParse({
        ...snapshot,
        meta: { listName: "я".repeat(41) },
      }).success,
    ).toBe(false);
  });
});
