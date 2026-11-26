import { describe, expect, it } from "vitest";

import { formatDayMonth, formatRemaining, remainingVerb } from "./dates";

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

describe("дни рождения", () => {
  it("nextBirthdayDate не перескакивает на следующий день после 23:00", async () => {
    const { birthdayInDays, daysUntilBirthday, nextBirthdayDate } =
      await import("./dates");
    const lateEvening = new Date(2026, 10, 26, 23, 30).getTime();
    const birthday = birthdayInDays(5, lateEvening);
    expect(daysUntilBirthday(birthday, lateEvening)).toBe(5);
    expect(nextBirthdayDate(birthday, lateEvening)).toBe("2026-12-01");
  });

  it("сегодняшний день рождения — 0 дней, вчерашний — через год", async () => {
    const { daysUntilBirthday } = await import("./dates");
    const now = new Date(2026, 10, 26, 10).getTime();
    expect(daysUntilBirthday("11-26", now)).toBe(0);
    expect(daysUntilBirthday("11-25", now)).toBe(364);
  });
});

describe("formatDayMonth", () => {
  it("дата без времени — по местному календарю, без сдвига поясом", () => {
    expect(formatDayMonth("2027-03-14")).toBe("14 марта");
    expect(formatDayMonth("2026-12-31")).toBe("31 декабря");
  });

  it("мусор — пустая строка", () => {
    expect(formatDayMonth("не дата")).toBe("");
  });
});

describe("formatBirthday", () => {
  it("MM-DD → «5 декабря», мусор — пусто", async () => {
    const { formatBirthday } = await import("./dates");
    expect(formatBirthday("12-05")).toBe("5 декабря");
    expect(formatBirthday("13-01")).toBe("");
  });
});
