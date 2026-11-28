import { describe, expect, it } from "vitest";

import { lostProfileMessage } from "./model";

describe("lostProfileMessage (S04)", () => {
  it("с именем из профиля — в кавычках", () => {
    expect(lostProfileMessage({ name: "Азамат", title: "Офис" })).toBe(
      "Я в Тайном Санте «Офис», но телефон потерял мой профиль. Убери, пожалуйста, мой старый профиль «Азамат», чтобы моего подопечного взял другой Санта",
    );
  });

  it("без имени — без кавычек с именем", () => {
    for (const name of [undefined, null, "", "  "]) {
      expect(lostProfileMessage({ name, title: "Офис" })).toBe(
        "Я в Тайном Санте «Офис», но телефон потерял мой профиль. Убери, пожалуйста, мой старый профиль, чтобы моего подопечного взял другой Санта",
      );
    }
  });
});
