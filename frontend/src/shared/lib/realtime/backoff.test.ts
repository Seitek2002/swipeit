import { describe, expect, it } from "vitest";

import { reconnectDelay } from "./backoff";

describe("reconnectDelay", () => {
  it("1 → 2 → 4 → 8 секунд, дальше каждые 8 без разброса (lan)", () => {
    expect([0, 1, 2, 3, 4, 10].map((n) => reconnectDelay(n))).toEqual([
      1000, 2000, 4000, 8000, 8000, 8000,
    ]);
  });

  it("разброс ±20% (remote) — в пределах и по краям", () => {
    expect(reconnectDelay(0, 0.2, () => 0)).toBe(800);
    expect(reconnectDelay(0, 0.2, () => 0.5)).toBe(1000);
    expect(reconnectDelay(3, 0.2, () => 0.999_999)).toBe(9600);
    for (let i = 0; i < 100; i += 1) {
      const delay = reconnectDelay(2, 0.2);
      expect(delay).toBeGreaterThanOrEqual(3200);
      expect(delay).toBeLessThanOrEqual(4800);
    }
  });

  it("отрицательная попытка — как первая", () => {
    expect(reconnectDelay(-1)).toBe(1000);
  });
});
