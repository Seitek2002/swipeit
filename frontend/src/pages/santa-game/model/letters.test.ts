import { describe, expect, it } from "vitest";

import { lettersMessage, namesLine } from "./letters";

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
