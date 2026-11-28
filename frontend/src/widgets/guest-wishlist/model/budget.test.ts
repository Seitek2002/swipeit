import { describe, expect, it } from "vitest";

import { budgetChips, fitsBudget } from "./budget";

describe("фильтр по бюджету в гостевом вишлисте (P10)", () => {
  it("меньше 6 желаний с ценой — чипов нет", () => {
    expect(budgetChips([500, 900, 2000, 4000, 7000])).toEqual([]);
  });

  it("8 желаний — чипы только там, где что-то есть", () => {
    expect(
      budgetChips([2500, 2800, 4000, 7000, 9000, 12000, undefined, 4900]),
    ).toEqual([3000, 5000]);
  });

  it("«до 3 000» — по нижней цене; без цены — только во «Все»", () => {
    expect(fitsBudget(2900, 3000)).toBe(true);
    expect(fitsBudget(3100, 3000)).toBe(false);
    expect(fitsBudget(undefined, 3000)).toBe(false);
    expect(fitsBudget(undefined, null)).toBe(true);
  });
});
