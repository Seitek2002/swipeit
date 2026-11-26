import { describe, expect, it } from "vitest";

import { plural, pluralize } from "./plural";

const GIFTS = ["подарок", "подарка", "подарков"] as const;

describe("plural", () => {
  it.each([
    [0, "подарков"],
    [1, "подарок"],
    [2, "подарка"],
    [4, "подарка"],
    [5, "подарков"],
    [11, "подарков"],
    [12, "подарков"],
    [14, "подарков"],
    [21, "подарок"],
    [22, "подарка"],
    [25, "подарков"],
    [101, "подарок"],
    [111, "подарков"],
    [1004, "подарка"],
  ])("%i → %s", (count, expected) => {
    expect(plural(count, GIFTS)).toBe(expected);
  });

  it("pluralize склеивает число и слово", () => {
    expect(pluralize(3, GIFTS)).toBe("3 подарка");
  });
});
