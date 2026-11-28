import { describe, expect, it } from "vitest";

import { privacyText } from "./privacy-model";

// «Что SwipeIt хранит» (auto-tasks-pm-4 S11).
describe("privacyText", () => {
  it("демо — одна строка про браузер", () => {
    expect(privacyText("local", { telegram: true })).toEqual({
      kind: "demo",
      text: "Это демо: всё хранится только в этом браузере.",
    });
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

  it("тексты без рода: ни «ввёл», ни «отметил»", () => {
    const text = privacyText("remote", { telegram: true });
    expect(JSON.stringify(text)).not.toMatch(/ввёл|отметил/);
  });
});
