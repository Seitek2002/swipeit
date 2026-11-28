import { describe, expect, it } from "vitest";

import { loadConfig, multiWishlistsEnabled } from "../src/config";

// Переключатель «несколько вишлистов» (spec-multi-wishlists, решение
// владельца 28.11): без переменной — выключено только в production.
describe("FEATURE_MULTI_WISHLISTS", () => {
  const base = {
    DATABASE_URL: "postgres://u:p@localhost:5432/db",
    PUBLIC_SHARE_URL: "https://s.example",
  };

  it("нет переменной: production — выключено, разработка — включено", () => {
    expect(
      multiWishlistsEnabled(loadConfig({ ...base, NODE_ENV: "production" })),
    ).toBe(false);
    expect(
      multiWishlistsEnabled(loadConfig({ ...base, NODE_ENV: "development" })),
    ).toBe(true);
  });

  it("явное значение важнее режима; пустая строка — как нет переменной", () => {
    expect(
      multiWishlistsEnabled(
        loadConfig({
          ...base,
          NODE_ENV: "production",
          FEATURE_MULTI_WISHLISTS: "1",
        }),
      ),
    ).toBe(true);
    expect(
      multiWishlistsEnabled(
        loadConfig({
          ...base,
          NODE_ENV: "development",
          FEATURE_MULTI_WISHLISTS: "0",
        }),
      ),
    ).toBe(false);
    expect(
      multiWishlistsEnabled(
        loadConfig({
          ...base,
          NODE_ENV: "production",
          FEATURE_MULTI_WISHLISTS: "",
        }),
      ),
    ).toBe(false);
  });

  it("неверное значение — ошибка конфига", () => {
    expect(() =>
      loadConfig({ ...base, FEATURE_MULTI_WISHLISTS: "yes" }),
    ).toThrow();
  });
});
