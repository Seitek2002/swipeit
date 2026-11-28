import { describe, expect, it } from "vitest";

import { joinNames, remindText } from "./model";

describe("joinNames", () => {
  it("один, двое, трое", () => {
    expect(joinNames([])).toBe("");
    expect(joinNames(["Мээрим"])).toBe("Мээрим");
    expect(joinNames(["Мээрим", "Бекзат"])).toBe("Мээрим и Бекзат");
    expect(joinNames(["Азамат", "Нурай", "Данияр"])).toBe(
      "Азамат, Нурай и Данияр",
    );
  });
});

describe("текст «Напомнить» (X06)", () => {
  const TITLE = "Новогодние каникулы";

  it("один отстающий — по имени и сколько осталось ему", () => {
    expect(remindText([{ name: "Мээрим", left: 5 }], TITLE)).toBe(
      "Мээрим, долистай «Новогодние каникулы» — осталось 5 карточек",
    );
    expect(remindText([{ name: "Мээрим", left: 1 }], TITLE)).toBe(
      "Мээрим, долистай «Новогодние каникулы» — осталась 1 карточка",
    );
    expect(remindText([{ name: "Мээрим", left: 3 }], TITLE)).toBe(
      "Мээрим, долистай «Новогодние каникулы» — осталось 3 карточки",
    );
  });

  it("двое — оба по имени, сколько у самого отстающего", () => {
    expect(
      remindText(
        [
          { name: "Мээрим", left: 5 },
          { name: "Бекзат", left: 8 },
        ],
        TITLE,
      ),
    ).toBe(
      "Мээрим и Бекзат, долистайте «Новогодние каникулы» — осталось не больше 8 карточек",
    );
    expect(
      remindText(
        [
          { name: "Мээрим", left: 1 },
          { name: "Бекзат", left: 1 },
        ],
        TITLE,
      ),
    ).toBe(
      "Мээрим и Бекзат, долистайте «Новогодние каникулы» — осталось не больше 1 карточки",
    );
  });

  it("больше пяти — пять имён и «и ещё N»", () => {
    const names = ["Мээрим", "Бекзат", "Нурай", "Данияр", "Азамат", "Тимур"];
    const lagging = names.map((name, index) => ({ name, left: index + 2 }));
    expect(remindText(lagging, TITLE)).toBe(
      "Мээрим, Бекзат, Нурай, Данияр, Азамат и ещё 1, долистайте «Новогодние каникулы» — осталось не больше 7 карточек",
    );
    expect(
      remindText([...lagging, { name: "Айжан", left: 20 }], TITLE),
    ).toContain("Азамат и ещё 2, долистайте");
  });
});
