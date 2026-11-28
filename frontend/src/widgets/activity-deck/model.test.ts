import { describe, expect, it } from "vitest";

import {
  deckEndLines,
  deckStatus,
  inviteText,
  joinNames,
  remindText,
  swipeMinutes,
} from "./model";

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
    expect(
      remindText([{ name: "Мээрим", left: 5, started: true }], TITLE),
    ).toBe("Мээрим, долистай «Новогодние каникулы» — осталось 5 карточек");
    expect(
      remindText([{ name: "Мээрим", left: 1, started: true }], TITLE),
    ).toBe("Мээрим, долистай «Новогодние каникулы» — осталась 1 карточка");
    expect(
      remindText([{ name: "Мээрим", left: 3, started: true }], TITLE),
    ).toBe("Мээрим, долистай «Новогодние каникулы» — осталось 3 карточки");
  });

  it("двое — оба по имени, сколько у самого отстающего", () => {
    expect(
      remindText(
        [
          { name: "Мээрим", left: 5, started: true },
          { name: "Бекзат", left: 8, started: true },
        ],
        TITLE,
      ),
    ).toBe(
      "Мээрим и Бекзат, долистайте «Новогодние каникулы» — осталось не больше 8 карточек",
    );
    expect(
      remindText(
        [
          { name: "Мээрим", left: 1, started: true },
          { name: "Бекзат", left: 1, started: true },
        ],
        TITLE,
      ),
    ).toBe(
      "Мээрим и Бекзат, долистайте «Новогодние каникулы» — осталось не больше 1 карточки",
    );
  });

  it("больше пяти — пять имён и «и ещё N»", () => {
    const names = ["Мээрим", "Бекзат", "Нурай", "Данияр", "Азамат", "Тимур"];
    const lagging = names.map((name, index) => ({
      name,
      left: index + 2,
      started: true,
    }));
    expect(remindText(lagging, TITLE)).toBe(
      "Мээрим, Бекзат, Нурай, Данияр, Азамат и ещё 1, долистайте «Новогодние каникулы» — осталось не больше 7 карточек",
    );
    expect(
      remindText(
        [...lagging, { name: "Айжан", left: 20, started: true }],
        TITLE,
      ),
    ).toContain("Азамат и ещё 2, долистайте");
  });

  it("не начинавшие — «полистайте», без «не больше» (Y08)", () => {
    expect(
      remindText(
        [
          { name: "Мээрим", left: 50, started: false },
          { name: "Азамат", left: 50, started: false },
        ],
        "Выходные 6–7 декабря",
      ),
    ).toBe(
      "Мээрим, Азамат, полистайте «Выходные 6–7 декабря» — 50 карточек, пара минут",
    );
    expect(
      remindText([{ name: "Мээрим", left: 12, started: false }], TITLE),
    ).toBe("Мээрим, полистай «Новогодние каникулы» — 12 карточек, пара минут");
    expect(
      remindText([{ name: "Мээрим", left: 100, started: false }], TITLE),
    ).toBe("Мээрим, полистай «Новогодние каникулы» — 100 карточек, 4 минуты");
  });

  it("начавшие и не начинавшие — два предложения", () => {
    expect(
      remindText(
        [
          { name: "Азамат", left: 5, started: true },
          { name: "Мээрим", left: 50, started: false },
        ],
        TITLE,
      ),
    ).toBe(
      "Азамат, долистай «Новогодние каникулы» — осталось 5 карточек. Мээрим, полистай тоже — 50 карточек, пара минут",
    );
  });
});

describe("статус в шапке колоды (Y08)", () => {
  const fresh = (name: string) => ({ name, left: 50, started: false });
  const busy = (name: string) => ({ name, left: 10, started: true });

  it("один, все долистали", () => {
    expect(deckStatus(0, [])).toBe("Ты листаешь один");
    expect(deckStatus(2, [])).toBe("Остальные уже всё пролистали");
  });

  it("«листают» — только начавшие, у остальных «ещё не открывали»", () => {
    expect(deckStatus(2, [busy("Мээрим"), busy("Азамат")])).toBe(
      "Мээрим и Азамат листают вместе с тобой",
    );
    expect(deckStatus(2, [fresh("Мээрим"), fresh("Азамат")])).toBe(
      "Ещё не открывали: Мээрим и Азамат",
    );
    expect(deckStatus(2, [busy("Азамат"), fresh("Мээрим")])).toBe(
      "Азамат листает вместе с тобой · ещё не открывали: Мээрим",
    );
  });

  it("конец колоды — по строке на начавших и не открывавших", () => {
    expect(deckEndLines([busy("Азамат")])).toEqual(["Азамат ещё листает"]);
    expect(deckEndLines([fresh("Мээрим"), fresh("Азамат")])).toEqual([
      "Ещё не открывали: Мээрим и Азамат",
    ]);
    expect(
      deckEndLines([busy("Азамат"), busy("Нурай"), fresh("Мээрим")]),
    ).toEqual(["Азамат и Нурай ещё листают", "Ещё не открывали: Мээрим"]);
  });
});

describe("приглашение «Отправь план в чат» (Y01)", () => {
  it("название, дата и сколько займёт", () => {
    expect(inviteText("Выходные 6–7 декабря", "до 29 ноября, 20:00", 50)).toBe(
      "Листаем «Выходные 6–7 декабря» до 29 ноября, 20:00 — займёт 2 минуты",
    );
    expect(inviteText("Кино", null, 12)).toBe("Листаем «Кино» — займёт минуту");
    expect(inviteText("Кино", null, 125)).toBe(
      "Листаем «Кино» — займёт 5 минут",
    );
  });

  it("минуты на колоду — не меньше одной", () => {
    expect(swipeMinutes(0)).toBe(1);
    expect(swipeMinutes(50)).toBe(2);
    expect(swipeMinutes(100)).toBe(4);
  });
});
