import { describe, expect, it } from "vitest";

import { findNamesake, namesakeText } from "./model";

describe("тёзки на экранах приглашений (R04)", () => {
  const people = [
    { id: "u_1", name: "Азамат" },
    { id: "u_2", name: "Алёна" },
  ];

  it("находит тёзку без регистра и с «ё» = «е», кроме меня самого", () => {
    expect(findNamesake(people, "азамат ")?.id).toBe("u_1");
    expect(findNamesake(people, "Алена")?.id).toBe("u_2");
    expect(findNamesake(people, "Азамат", "u_1")).toBeUndefined();
  });

  it("с буквой фамилии или пустым именем — не тёзка", () => {
    expect(findNamesake(people, "Азамат К.")).toBeUndefined();
    expect(findNamesake(people, "")).toBeUndefined();
  });

  it("текст для плана — без «Санта не перепутал»", () => {
    expect(namesakeText("Азамат", "santa")).toBe(
      "В игре уже есть Азамат. Если это ты с другого телефона или браузера — открой игру там, где вступал. Если нет — добавь первую букву фамилии, чтобы Санта не перепутал",
    );
    expect(namesakeText("Азамат", "plan")).toBe(
      "В плане уже есть Азамат. Если это ты с другого телефона или браузера — открой план там, где вступал. Если нет — добавь первую букву фамилии",
    );
  });
});
