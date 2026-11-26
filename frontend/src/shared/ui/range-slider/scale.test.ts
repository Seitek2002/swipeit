import { describe, expect, it } from "vitest";

import {
  BUDGET_MAX,
  fromPosition,
  nextStop,
  snapPosition,
  toPosition,
} from "./scale";

describe("логарифмическая шкала бюджета", () => {
  it("края шкалы", () => {
    expect(toPosition(0)).toBe(0);
    expect(toPosition(BUDGET_MAX)).toBe(1);
  });

  it("3 000 сом — примерно середина трека, а не 3%", () => {
    expect(toPosition(3000)).toBeGreaterThan(0.45);
    expect(toPosition(3000)).toBeLessThan(0.55);
  });

  it("позиция и значение взаимно обратны", () => {
    for (const value of [500, 1000, 7300, 42_000]) {
      expect(fromPosition(toPosition(value))).toBeCloseTo(value, 6);
    }
  });

  it("магниты притягивают ползунок", () => {
    expect(snapPosition(toPosition(5000) + 0.01)).toBe(5000);
    expect(snapPosition(toPosition(1000) - 0.01)).toBe(1000);
  });

  it("вне магнитов значение округляется", () => {
    const value = snapPosition(toPosition(7340));
    expect(value % 100).toBe(0);
  });

  it("конец трека — без верхней границы", () => {
    expect(snapPosition(0.999)).toBe(BUDGET_MAX);
  });

  it("клавиатурные шаги", () => {
    expect(nextStop(5000, 1)).toBe(7000);
    expect(nextStop(5000, -1)).toBe(4000);
    expect(nextStop(0, -1)).toBe(0);
    expect(nextStop(BUDGET_MAX, 1)).toBe(BUDGET_MAX);
    expect(nextStop(1200, 1)).toBe(1500);
  });
});
