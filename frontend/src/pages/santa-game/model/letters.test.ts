import { describe, expect, it } from "vitest";

import {
  lettersMessage,
  namesLine,
  remindWishlistNames,
  remindWishlistText,
} from "./letters";

const base = {
  title: "Офис",
  terms: "Бюджет до 2 000 сом. Обмен подарками 25 декабря.",
  exchange: "25 декабря",
  senderId: "me",
};

const member = (id: string, name: string, opened = false) => ({
  id,
  name,
  opened,
});

describe("namesLine — длинный список имён (R03)", () => {
  it("20 имён — четыре и «и ещё 16»", () => {
    const names = [
      "Нурай",
      "Бакыт",
      "Алина",
      "Мээрим",
      ...Array.from({ length: 16 }, (_, index) => `Гость ${index + 1}`),
    ];
    expect(namesLine(names)).toBe("Нурай, Бакыт, Алина, Мээрим и ещё 16");
  });

  it("пять имён — все, без «и ещё»", () => {
    expect(namesLine(["А", "Б", "В", "Г", "Д"])).toBe("А, Б, В, Г, Д");
  });
});

describe("«Сообщить в чат» после жеребьёвки (Q06)", () => {
  it("кто не открыл — по именам, больше пяти — «и ещё N»", () => {
    expect(namesLine(["Нурай", "Бакыт"])).toBe("Нурай, Бакыт");
    expect(namesLine(["А", "Б", "В", "Г", "Д", "Е", "Ж", "З"])).toBe(
      "А, Б, В, Г и ещё 4",
    );
    expect(
      lettersMessage({
        ...base,
        members: [
          member("me", "Айгерим", true),
          member("n", "Нурай"),
          member("b", "Бакыт"),
        ],
      }),
    ).toBe(
      "Жеребьёвка в «Офис» прошла: Нурай, Бакыт — откройте письмо и узнайте, кому дарите. Бюджет до 2 000 сом. Обмен подарками 25 декабря.",
    );
  });

  it("все открыли — про обмен", () => {
    expect(
      lettersMessage({
        ...base,
        members: [member("me", "Айгерим", true), member("n", "Нурай", true)],
      }),
    ).toBe(
      "Все открыли письма в «Офис». Обмен 25 декабря — не забудьте подарки!",
    );
  });

  it("отправитель себя не зовёт, даже если сам не открыл (X08)", () => {
    expect(
      lettersMessage({
        ...base,
        members: [
          member("me", "Айгерим"),
          member("a", "Азамат"),
          member("d", "Данияр"),
          member("n", "Нурай", true),
        ],
      }),
    ).toBe(
      "Жеребьёвка в «Офис» прошла: Азамат, Данияр — откройте письмо и узнайте, кому дарите. Бюджет до 2 000 сом. Обмен подарками 25 декабря.",
    );
  });

  it("8 и больше, и письма ещё никто не открыл, — «все N участников»", () => {
    const many = (count: number) =>
      Array.from({ length: count }, (_, index) =>
        member(index === 0 ? "me" : `u${index}`, `Гость ${index}`),
      );
    expect(lettersMessage({ ...base, members: many(30) })).toBe(
      "Жеребьёвка в «Офис» прошла — все 30 участников, откройте письмо и узнайте, кому дарите. Бюджет до 2 000 сом. Обмен подарками 25 декабря.",
    );
    // Отправитель уже открыл — всё равно все остальные ждут.
    const opened = many(8).map((one, index) =>
      index === 0 ? { ...one, opened: true } : one,
    );
    expect(lettersMessage({ ...base, members: opened })).toMatch(
      /прошла — все 8 участников, откройте/,
    );
    // Кто-то уже открыл — по именам, не больше пяти.
    const some = many(8).map((one, index) =>
      index === 3 ? { ...one, opened: true } : one,
    );
    expect(lettersMessage({ ...base, members: some })).toMatch(
      /прошла: Гость 1, Гость 2, Гость 4, Гость 5 и ещё 2 — откройте/,
    );
  });

  it("не открыл только отправитель — без имён и без «все открыли» (X08)", () => {
    expect(
      lettersMessage({
        ...base,
        members: [member("me", "Айгерим"), member("n", "Нурай", true)],
      }),
    ).toBe(
      "Жеребьёвка в «Офис» прошла — откройте письмо и узнайте, кому дарите. Бюджет до 2 000 сом. Обмен подарками 25 декабря.",
    );
  });
});

describe("«Напомнить тем, кто без вишлиста» (P08, Y07)", () => {
  const person = (
    id: string,
    name: string,
    hasWishlist: boolean,
    joined = true,
  ) => ({
    id,
    name,
    hasWishlist,
    joined,
  });

  it("зовёт вступивших без вишлиста, позванных не трогает", () => {
    const names = remindWishlistNames(
      [
        person("me", "Айгерим", true),
        person("n", "Нурай", false),
        person("b", "Бакыт", false),
        person("t", "Тимур", false, false),
        person("a", "Азамат", true),
      ],
      "me",
    );
    expect(names).toEqual(["Нурай", "Бакыт"]);
    expect(
      remindWishlistText(names, { title: "Офис", budget: 1500 }).replace(
        / /g,
        " ",
      ),
    ).toBe(
      "Нурай, Бакыт — соберите вишлист для Тайного Санты «Офис»: хотя бы 3 желания до 1 500 сом, так Санте будет проще выбрать подарок",
    );
  });

  it("зовёт и тех, у кого 1–2 желания в бюджете (Z03)", () => {
    expect(
      remindWishlistNames(
        [
          { ...person("me", "Айгерим", true), wishesInBudget: 1 },
          { ...person("n", "Нурай", true), wishesInBudget: 2 },
          { ...person("b", "Бакыт", true), wishesInBudget: 3 },
          { ...person("a", "Азамат", true), wishesInBudget: 0 },
        ],
        "me",
      ),
    ).toEqual(["Нурай", "Азамат"]);
  });

  it("организатор без вишлиста себя не зовёт; кроме него никого — пусто", () => {
    expect(
      remindWishlistNames(
        [person("me", "Бакыт", false), person("n", "Нурай", false)],
        "me",
      ),
    ).toEqual(["Нурай"]);
    expect(remindWishlistNames([person("me", "Бакыт", false)], "me")).toEqual(
      [],
    );
  });
});
