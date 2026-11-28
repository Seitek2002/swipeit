import { describe, expect, it } from "vitest";

import {
  countInSantaBudget,
  inSantaBudget,
  santaWishlistStatus,
} from "./santa-wishlist";

describe("вишлист в Санте (Z03)", () => {
  it("0 в бюджете — без вишлиста, 1–2 — мало, 3 и больше — готов", () => {
    expect(santaWishlistStatus(0)).toBe("none");
    expect(santaWishlistStatus(1)).toBe("few");
    expect(santaWishlistStatus(2)).toBe("few");
    expect(santaWishlistStatus(3)).toBe("ready");
    expect(santaWishlistStatus(8)).toBe("ready");
  });

  it("в бюджете — по нижней цене, без цены — не в бюджете", () => {
    expect(inSantaBudget(1000, 1000)).toBe(true);
    expect(inSantaBudget(1001, 1000)).toBe(false);
    expect(inSantaBudget(null, 1000)).toBe(false);
    expect(countInSantaBudget([500, null, 1500, 990], 1000)).toBe(2);
  });
});
