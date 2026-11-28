import { afterEach, describe, expect, it, vi } from "vitest";

import { multiWishlistsFlag } from "./features";

describe("переключатель «несколько вишлистов»", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("1 — включено, 0 — выключено, нет переменной — решает режим (null)", () => {
    vi.stubEnv("NEXT_PUBLIC_MULTI_WISHLISTS", "1");
    expect(multiWishlistsFlag()).toBe(true);
    vi.stubEnv("NEXT_PUBLIC_MULTI_WISHLISTS", "0");
    expect(multiWishlistsFlag()).toBe(false);
    vi.stubEnv("NEXT_PUBLIC_MULTI_WISHLISTS", "");
    expect(multiWishlistsFlag()).toBeNull();
  });
});
