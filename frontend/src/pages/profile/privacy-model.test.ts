import { describe, expect, it } from "vitest";

import { privacyText } from "./privacy-model";

// «Что SwipeIt хранит» (auto-tasks-pm-4 S11).
describe("privacyText", () => {
  it("демо — строка про браузер и про вишлист в ссылке (Z06)", () => {
    expect(privacyText("local", { telegram: true })).toEqual({
      kind: "demo",
      text: "Это демо: всё хранится в этом браузере. Отправленный вишлист лежит в самой ссылке — его увидит любой, у кого она есть.",
    });
  });

  it("локальная сеть — про ноутбук и тоже про вишлист в ссылке", () => {
    const text = privacyText("lan", { telegram: false });
    if (text.kind !== "demo") throw new Error("ждали demo");
    expect(text.text).toContain("на ноутбуке");
    expect(text.text).toContain("лежит в самой ссылке");
  });

  it("remote без входа через Telegram — без пункта про Telegram", () => {
    const text = privacyText("remote", { telegram: false });
    if (text.kind !== "remote") throw new Error("ждали remote");
    expect(text.title).toBe("Что SwipeIt знает о тебе");
    expect(text.items).toHaveLength(6);
    expect(text.items.join(" ")).not.toContain("Telegram");
    expect(text.deleteNote).toBe(
      "Удалить всё можно в профиле: «Удалить профиль».",
    );
  });

  it("remote с NEXT_PUBLIC_TELEGRAM_CLIENT_ID — пункт про номер аккаунта", () => {
    const text = privacyText("remote", { telegram: true });
    if (text.kind !== "remote") throw new Error("ждали remote");
    expect(text.items.at(-1)).toBe(
      "Если войдёшь через Telegram — только номер аккаунта, без телефона и переписки.",
    );
  });

  it("тексты без рода: ни «ввёл», ни «отметил», ни «отправил»", () => {
    const texts = [
      privacyText("remote", { telegram: true }),
      privacyText("local", { telegram: false }),
      privacyText("lan", { telegram: false }),
    ];
    expect(JSON.stringify(texts)).not.toMatch(/ввёл|отметил|отправил/);
  });
});
