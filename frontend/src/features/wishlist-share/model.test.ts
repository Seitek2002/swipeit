import { describe, expect, it } from "vitest";

import type { ImportantDateView } from "@/shared/api";

import {
  daysUntil,
  knownOccasionFor,
  stepAfterCalendar,
  whenOptions,
} from "./model";

// 20 декабря 2026, полдень по местному времени.
const NOW = new Date(2026, 11, 20, 12).getTime();

const anniversary: ImportantDateView = {
  id: "d_1",
  ownerId: "u_1",
  date: "06-02",
  preset: "anniversary",
  autoNumber: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  title: "Годовщина",
  nextDate: "2027-06-02",
} as ImportantDateView;

describe("шаги отправки вишлиста", () => {
  it("дни до даты переходят через Новый год, 29 февраля — 28-е", () => {
    expect(daysUntil("12-20", NOW)).toBe(0);
    expect(daysUntil("12-31", NOW)).toBe(11);
    expect(daysUntil("01-10", NOW)).toBe(21);
    // 2027 — невисокосный: 29 февраля → 28 февраля.
    expect(daysUntil("02-29", NOW)).toBe(daysUntil("02-28", NOW));
  });

  it("варианты — ближайшая дата первой, со своим днём рождения и датами", () => {
    const options = whenOptions({ birthday: "03-14" }, [anniversary], NOW);
    expect(options.map((option) => option.label)).toEqual([
      "Новый год, 31 декабря",
      "8 Марта",
      "Мой день рождения, 14 марта",
      "Годовщина, 2 июня",
    ]);
    expect(options[3]?.occasion).toEqual({ kind: "important", dateId: "d_1" });
  });

  it("без дня рождения его строки нет", () => {
    expect(
      whenOptions({}, [], NOW).some((option) => option.icon === "birthday"),
    ).toBe(false);
  });

  it("известная дата из календаря — повод без вопросов", () => {
    expect(knownOccasionFor("03-14", { birthday: "03-14" }, [])).toEqual({
      kind: "birthday",
    });
    expect(knownOccasionFor("06-02", {}, [anniversary])).toEqual({
      kind: "important",
      dateId: "d_1",
    });
    expect(knownOccasionFor("03-08", {}, [])).toEqual({ kind: "march_8" });
    expect(knownOccasionFor("07-07", {}, [])).toBeNull();
  });

  it("«Это твой день рождения?» — только пока день рождения неизвестен", () => {
    expect(stepAfterCalendar("07-07", {}, [])).toBe("is-birthday");
    expect(stepAfterCalendar("07-07", { birthday: "03-14" }, [])).toBe("what");
    expect(stepAfterCalendar("03-14", { birthday: "03-14" }, [])).toBe("send");
  });
});

describe("повод из напоминания до ответа сервера", () => {
  it("день рождения и значимая дата получают дату и готовый повод", async () => {
    const { displayOccasion } = await import("./model");
    expect(
      displayOccasion({ kind: "birthday" }, { birthday: "03-14" }, [], NOW),
    ).toEqual({ kind: "birthday", date: "2027-03-14" });
    expect(
      displayOccasion(
        { kind: "important", dateId: "d_1" },
        {},
        [anniversary],
        NOW,
      ),
    ).toEqual({
      kind: "important",
      dateId: "d_1",
      preset: "anniversary",
      date: "2027-06-02",
    });
  });
});
