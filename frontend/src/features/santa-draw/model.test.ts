import { describe, expect, it } from "vitest";

import { drawConfirmText, namesakeGroup, namesakeNote } from "./model";

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
    expect(drawConfirmText({ withoutWishlist: 0, namesakes: null })).toBe(
      "Поменять пары потом нельзя. У всех вишлисты готовы.",
    );
    expect(
      drawConfirmText({
        withoutWishlist: 2,
        namesakes: namesakeNote(["Азамат", "Азамат"]),
      }),
    ).toBe(
      "Поменять пары потом нельзя. 2 участника ещё без вишлиста. В игре два „Азамат“. Если это один человек с двух телефонов — убери лишнего, иначе ему достанутся два подопечных.",
    );
  });
});
