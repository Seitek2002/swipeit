import { describe, expect, it } from "vitest";

import { EMPTY_FILTERS } from "@/shared/api";

import {
  activeFilterChips,
  countActiveFilters,
  describeFilters,
} from "./model";

describe("аудитория в фильтрах", () => {
  it("«для неё» — чип, который снимается; «всем» чипа не даёт", () => {
    const filters = { ...EMPTY_FILTERS, audience: "female" as const };
    const chips = activeFilterChips(filters);
    expect(chips.map((chip) => chip.label)).toEqual(["для неё"]);
    expect(chips[0]?.remove(filters).audience).toBeUndefined();
    expect(countActiveFilters({ ...EMPTY_FILTERS, audience: "all" })).toBe(0);
  });

  it("попадает в условия ссылки-фильтра словами", () => {
    expect(
      describeFilters({
        ...EMPTY_FILTERS,
        categories: ["tech"],
        audience: "male",
      }),
    ).toBe("для него, в категории Техника");
  });
});
