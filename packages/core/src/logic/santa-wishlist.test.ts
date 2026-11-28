import { describe, expect, it } from "vitest";

import {
  countInSantaBudget,
  inSantaBudget,
  santaWishlistStatus,
} from "./santa-wishlist";

describe("вишлист в Санте (Z03)", () => {
  it("без вишлиста — none, 1–2 в бюджете — мало, 3 и больше — готов", () => {
    const status = (inBudget: number) =>
      santaWishlistStatus({ hasWishlist: inBudget > 0, inBudget });
    expect(status(0)).toBe("none");
    expect(status(1)).toBe("few");
    expect(status(2)).toBe("few");
    expect(status(3)).toBe("ready");
    expect(status(8)).toBe("ready");
  });

  it("вишлист есть, но все желания дороже бюджета, — мало, не «без вишлиста» (T28)", () => {
    expect(santaWishlistStatus({ hasWishlist: true, inBudget: 0 })).toBe("few");
    expect(santaWishlistStatus({ hasWishlist: false, inBudget: 0 })).toBe(
      "none",
    );
  });

  it("в бюджете — по нижней цене, без цены — не в бюджете", () => {
    expect(inSantaBudget(1000, 1000)).toBe(true);
    expect(inSantaBudget(1001, 1000)).toBe(false);
    expect(inSantaBudget(null, 1000)).toBe(false);
    expect(countInSantaBudget([500, null, 1500, 990], 1000)).toBe(2);
  });
});
