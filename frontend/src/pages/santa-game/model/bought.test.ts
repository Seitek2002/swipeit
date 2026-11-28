import { describe, expect, it } from "vitest";

import { boughtStateOf, boughtToast, currentBought } from "./bought";

type Item = { key: string; reservedByMe?: boolean };

const item = (key: string, extra: Omit<Item, "key"> = {}): Item => ({
  key,
  ...extra,
});

const ward = (wishlist: Item[]) => ({ wishlist });

describe("«Что купил?» — текущий выбор и тосты (Y05)", () => {
  it("не отмечено — undefined, своя бронь — её ключ, без брони — «Другое»", () => {
    const list = ward([item("p_1"), item("p_2", { reservedByMe: true })]);
    expect(currentBought({ bought: false, ward: list })).toBeUndefined();
    expect(currentBought({ bought: true, ward: list })).toBe("p_2");
    expect(currentBought({ bought: true, ward: ward([item("p_1")]) })).toBe(
      null,
    );
    expect(currentBought(null)).toBeUndefined();
  });

  it("прежнее состояние для «Отменить»", () => {
    expect(boughtStateOf(undefined)).toEqual({ bought: false, itemKey: null });
    expect(boughtStateOf(null)).toEqual({ bought: true, itemKey: null });
    expect(boughtStateOf("p_2")).toEqual({ bought: true, itemKey: "p_2" });
  });

  it("тост называет покупку", () => {
    expect(boughtToast({ bought: true, itemKey: "p_2" }, "Колье")).toBe(
      "Отмечено: Колье",
    );
    expect(boughtToast({ bought: true, itemKey: null }, null)).toBe(
      "Отмечено: подарок куплен",
    );
    expect(boughtToast({ bought: false, itemKey: null }, null)).toBe(
      "Отметка снята",
    );
  });
});
