import { describe, expect, it } from "vitest";

import {
  daysInMonth,
  moveDay,
  parseMonthDay,
  toMonthDay,
  withMonth,
} from "./model";

describe("DayMonthPicker: дни месяца", () => {
  it("в феврале 29 дней — год не спрашиваем", () => {
    expect(daysInMonth(2)).toBe(29);
    expect(daysInMonth(4)).toBe(30);
    expect(daysInMonth(12)).toBe(31);
  });
});

describe("DayMonthPicker: значение MM-DD", () => {
  it("собирает и разбирает", () => {
    expect(toMonthDay(3, 14)).toBe("03-14");
    expect(parseMonthDay("03-14")).toEqual({ month: 3, day: 14 });
    expect(parseMonthDay("02-29")).toEqual({ month: 2, day: 29 });
  });

  it("кривое значение — null", () => {
    expect(parseMonthDay(null)).toBeNull();
    expect(parseMonthDay("")).toBeNull();
    expect(parseMonthDay("13-01")).toBeNull();
    expect(parseMonthDay("04-31")).toBeNull();
    expect(parseMonthDay("3-14")).toBeNull();
  });

  it("смена месяца сохраняет день, но не больше дней в месяце", () => {
    expect(withMonth("03-14", 6)).toBe("06-14");
    expect(withMonth("01-31", 2)).toBe("02-29");
    expect(withMonth("05-31", 4)).toBe("04-30");
  });
});

describe("DayMonthPicker: клавиатура", () => {
  it("стрелки — на день и на неделю, в пределах месяца", () => {
    expect(moveDay(14, "ArrowRight", 31)).toBe(15);
    expect(moveDay(14, "ArrowLeft", 31)).toBe(13);
    expect(moveDay(14, "ArrowDown", 31)).toBe(21);
    expect(moveDay(14, "ArrowUp", 31)).toBe(7);
    expect(moveDay(3, "ArrowUp", 31)).toBe(1);
    expect(moveDay(27, "ArrowDown", 29)).toBe(29);
  });

  it("Home/End — начало и конец месяца; чужая клавиша — null", () => {
    expect(moveDay(14, "Home", 30)).toBe(1);
    expect(moveDay(14, "End", 30)).toBe(30);
    expect(moveDay(14, "Tab", 30)).toBeNull();
  });
});
