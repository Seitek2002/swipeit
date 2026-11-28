import { describe, expect, it } from "vitest";

import { isClientOutdated } from "./client-build";

describe("isClientOutdated (B17, «Обнови приложение»)", () => {
  it("номера из цифр сравнивает как числа", () => {
    expect(isClientOutdated("9", "10")).toBe(true);
    expect(isClientOutdated("10", "9")).toBe(false);
    expect(isClientOutdated("10", "10")).toBe(false);
  });

  it("остальное — как строки", () => {
    expect(isClientOutdated("2026-11-27.1", "2026-11-28.1")).toBe(true);
    expect(isClientOutdated("2026-11-28.2", "2026-11-28.1")).toBe(false);
  });

  it("dev, «0» и пустой минимум не устаревают", () => {
    expect(isClientOutdated("dev", "999")).toBe(false);
    expect(isClientOutdated("5", "0")).toBe(false);
    expect(isClientOutdated("5", "")).toBe(false);
    expect(isClientOutdated("5", undefined)).toBe(false);
    expect(isClientOutdated("5", null)).toBe(false);
  });
});
