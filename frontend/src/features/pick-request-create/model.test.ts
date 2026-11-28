import { describe, expect, it } from "vitest";

import { EMPTY_FILTERS } from "@/entities/product";

import { canHidePrices, effectiveHidePrices } from "./model";

describe("«Скрыть цены от друга» (W02)", () => {
  it("без верхней границы бюджета цены не скрываются, даже если переключатель включали", () => {
    expect(canHidePrices(EMPTY_FILTERS)).toBe(false);
    expect(effectiveHidePrices(EMPTY_FILTERS, true)).toBe(false);
  });

  it("с бюджетом «до 3 000» — скрываются", () => {
    const filters = { ...EMPTY_FILTERS, budget: { min: 0, max: 3000 } };
    expect(canHidePrices(filters)).toBe(true);
    expect(effectiveHidePrices(filters, true)).toBe(true);
    expect(effectiveHidePrices(filters, false)).toBe(false);
  });
});
