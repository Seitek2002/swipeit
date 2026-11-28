import { describe, expect, it } from "vitest";

import {
  drawConfirmText,
  exclusionsLine,
  namesakeGroup,
  namesakeNote,
  wishlistGaps,
  wishlistsLine,
} from "./model";

const READY = { none: [], few: [] };

describe("тёзки перед жеребьёвкой (R04)", () => {
  it("находит первую группу тёзок без регистра и с «ё» = «е»", () => {
    expect(namesakeGroup(["Айгерим", "Азамат", "азамат "])).toEqual({
      count: 2,
      name: "Азамат",
    });
    expect(namesakeGroup(["Алёна", "Алена", "АЛЕНА"])).toEqual({
      count: 3,
      name: "Алёна",
    });
  });

  it("с буквой фамилии — не тёзки", () => {
    expect(namesakeGroup(["Азамат", "Азамат К."])).toBeNull();
    expect(namesakeNote(["Азамат", "Азамат К.", "Айгерим"])).toBeNull();
  });

  it("подпись: число словом до четырёх, дальше цифрой", () => {
    expect(namesakeNote(["Азамат", "Азамат"])).toBe(
      "В игре два „Азамат“. Если это один человек с двух телефонов — убери лишнего, иначе ему достанутся два подопечных",
    );
    expect(namesakeNote(["Азамат", "Азамат", "азамат"])).toMatch(
      /^В игре три „Азамат“/,
    );
    expect(namesakeNote(Array(5).fill("Азамат"))).toMatch(/^В игре 5 „Азамат“/);
  });

  it("подтверждение жеребьёвки добавляет строку про тёзок", () => {
    expect(
      drawConfirmText({ wishlists: READY, namesakes: null, exclusions: [] }),
    ).toBe(
      "Поменять пары потом нельзя. У всех вишлисты готовы. Исключений нет: пара может выпасть друг другу.",
    );
    expect(
      drawConfirmText({
        wishlists: { none: ["Бекзат"], few: ["ты"] },
        namesakes: namesakeNote(["Азамат", "Азамат"]),
        exclusions: [],
      }),
    ).toBe(
      "Поменять пары потом нельзя. Без вишлиста: Бекзат. Мало в бюджете: ты. Исключений нет: пара может выпасть друг другу. В игре два „Азамат“. Если это один человек с двух телефонов — убери лишнего, иначе ему достанутся два подопечных.",
    );
  });
});

describe("исключения в подтверждении жеребьёвки (Y04)", () => {
  const text = (exclusions: ReadonlyArray<readonly [string, string]>) =>
    drawConfirmText({ wishlists: READY, namesakes: null, exclusions });

  it("0 исключений — пара может выпасть друг другу", () => {
    expect(exclusionsLine([])).toBe(
      "Исключений нет: пара может выпасть друг другу",
    );
    expect(text([])).toContain(
      "Исключений нет: пара может выпасть друг другу.",
    );
  });

  it("1 исключение — по именам", () => {
    expect(text([["Азамат", "Нурай"]])).toBe(
      "Поменять пары потом нельзя. У всех вишлисты готовы. Учтём: Азамат ⇄ Нурай.",
    );
  });

  it("3 исключения — две пары и «и ещё 1»", () => {
    expect(
      text([
        ["Азамат", "Нурай"],
        ["Ты", "Данияр"],
        ["Тимур", "Мээрим"],
      ]),
    ).toBe(
      "Поменять пары потом нельзя. У всех вишлисты готовы. Учтём: Азамат ⇄ Нурай, Ты ⇄ Данияр и ещё 1.",
    );
  });
});

describe("вишлисты в подтверждении жеребьёвки (Z03)", () => {
  const member = (id: string, name: string, wishesInBudget: number) => ({
    id,
    name,
    hasWishlist: wishesInBudget > 0,
    wishesInBudget,
  });

  it("0, 2 и 3 желания в бюджете — без вишлиста, мало, готов; себя — «ты»", () => {
    const gaps = wishlistGaps(
      [
        member("me", "Айгерим", 2),
        member("b", "Бекзат", 0),
        member("n", "Нурай", 3),
      ],
      "me",
    );
    expect(gaps).toEqual({ none: ["Бекзат"], few: ["ты"] });
    expect(wishlistsLine(gaps)).toBe(
      "Без вишлиста: Бекзат. Мало в бюджете: ты.",
    );
  });

  it("есть желания, но все дороже бюджета, — без вишлиста", () => {
    expect(
      wishlistGaps([{ ...member("b", "Бекзат", 0), hasWishlist: true }], "me"),
    ).toEqual({ none: ["Бекзат"], few: [] });
  });

  it("больше трёх имён — «и ещё N»", () => {
    expect(
      wishlistsLine({
        none: ["Азамат", "Нурай", "Тимур", "Мээрим", "Бакыт"],
        few: [],
      }),
    ).toBe("Без вишлиста: Азамат, Нурай, Тимур и ещё 2.");
  });

  it("все готовы — одной фразой", () => {
    expect(wishlistsLine(READY)).toBe("У всех вишлисты готовы.");
  });
});
