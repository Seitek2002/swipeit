import { describe, expect, it } from "vitest";

import { lockedAfterDraw, termsChangedText } from "./santa-update";

const GAME = { title: "Офис", budget: 2000, exchangeDate: "2026-12-28" };

describe("lockedAfterDraw", () => {
  it("только дата обмена — можно", () => {
    expect(lockedAfterDraw({ exchangeDate: "2026-12-30" })).toBe(false);
    expect(lockedAfterDraw({})).toBe(false);
    // Поле есть, но undefined — его не меняют.
    expect(lockedAfterDraw({ budget: undefined })).toBe(false);
  });

  it("бюджет, название, жеребьёвка, исключения — нельзя", () => {
    expect(lockedAfterDraw({ budget: 3000 })).toBe(true);
    expect(lockedAfterDraw({ title: "Новое" })).toBe(true);
    expect(lockedAfterDraw({ drawMode: "manual" })).toBe(true);
    expect(lockedAfterDraw({ exclusions: [] })).toBe(true);
    expect(lockedAfterDraw({ exchangeDate: "2026-12-30", budget: 3000 })).toBe(
      true,
    );
  });
});

describe("termsChangedText", () => {
  it("бюджет или дата обмена поменялись — оба условия в тексте", () => {
    expect(termsChangedText(GAME, { ...GAME, budget: 3000 })).toBe(
      "Организатор изменил условия «Офис»: бюджет 3 000 сом, обмен 28 декабря",
    );
    expect(
      termsChangedText(GAME, { ...GAME, exchangeDate: "2026-12-27" }),
    ).toBe(
      "Организатор изменил условия «Офис»: бюджет 2 000 сом, обмен 27 декабря",
    );
  });

  it("только название — тоста нет; в тексте — новое название", () => {
    expect(termsChangedText(GAME, { ...GAME, title: "Офис 2027" })).toBeNull();
    expect(
      termsChangedText(GAME, { ...GAME, title: "Офис 2027", budget: 1000 }),
    ).toContain("«Офис 2027»");
  });
});
