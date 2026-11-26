import { describe, expect, it } from "vitest";

import { formatRemaining, remainingVerb } from "./dates";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe("formatRemaining", () => {
  it("дни и часы", () => {
    expect(formatRemaining(2 * DAY + 4 * HOUR)).toBe("2 дня 4 часа");
    expect(formatRemaining(5 * DAY)).toBe("5 дней");
    expect(formatRemaining(DAY + HOUR)).toBe("1 день 1 час");
  });

  it("часы и минуты", () => {
    expect(formatRemaining(5 * HOUR + 12 * MIN)).toBe("5 часов 12 минут");
    expect(formatRemaining(2 * HOUR + MIN)).toBe("2 часа 1 минута");
  });

  it("меньше часа — минуты и секунды", () => {
    expect(formatRemaining(12 * MIN + 5000)).toBe("12:05");
    expect(formatRemaining(59 * MIN + 59_500)).toBe("60:00");
    expect(formatRemaining(1)).toBe("0:01");
    expect(formatRemaining(0)).toBe("0:00");
  });

  it("согласование «Остался / Осталось»", () => {
    expect(remainingVerb(DAY + HOUR)).toBe("Остался");
    expect(remainingVerb(21 * DAY)).toBe("Остался");
    expect(remainingVerb(11 * DAY)).toBe("Осталось");
    expect(remainingVerb(2 * DAY)).toBe("Осталось");
    expect(remainingVerb(30 * MIN)).toBe("Осталось");
  });
});
