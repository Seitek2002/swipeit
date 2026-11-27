import { describe, expect, it } from "vitest";

import { NBSP, NNBSP, formatBudget, formatPrice } from "./format-price";

describe("formatPrice", () => {
  it("диапазон: неразрывные пробелы и узкие вокруг тире", () => {
    expect(formatPrice(2990, 3600)).toBe(
      `2${NBSP}990${NNBSP}–${NNBSP}3${NBSP}600${NBSP}сом`,
    );
  });

  it("min === max — одна цифра", () => {
    expect(formatPrice(2990, 2990)).toBe(`2${NBSP}990${NBSP}сом`);
  });

  it("без max — одна цифра", () => {
    expect(formatPrice(450)).toBe(`450${NBSP}сом`);
  });

  it("округляет до 10 сом", () => {
    expect(formatPrice(2994, 3606)).toBe(
      `2${NBSP}990${NNBSP}–${NNBSP}3${NBSP}610${NBSP}сом`,
    );
  });

  it("после округления равные края — одна цифра", () => {
    expect(formatPrice(1291, 1294)).toBe(`1${NBSP}290${NBSP}сом`);
  });

  it("крупные суммы", () => {
    expect(formatPrice(125_000)).toBe(`125${NBSP}000${NBSP}сом`);
  });
});

describe("formatBudget", () => {
  it("подписи бюджета", () => {
    expect(formatBudget(0, null)).toBe("Любой бюджет");
    expect(formatBudget(0, 5000)).toBe(`до${NBSP}5${NBSP}000${NBSP}сом`);
    expect(formatBudget(1000, null)).toBe(`от${NBSP}1${NBSP}000${NBSP}сом`);
    expect(formatBudget(1000, 5000)).toBe(
      `1${NBSP}000${NNBSP}–${NNBSP}5${NBSP}000${NBSP}сом`,
    );
  });
});
