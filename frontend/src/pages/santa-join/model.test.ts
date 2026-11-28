import { describe, expect, it } from "vitest";

import { closedInvite, lostProfileHint, lostProfileMessage } from "./model";

describe("приглашение, по которому не вступить (S04, Z01)", () => {
  it("не был в игре, жеребьёвка прошла — «новых не берём», потерянный профиль — тихой кнопкой", () => {
    expect(closedInvite({ drawn: true, removed: false })).toEqual({
      text: "Жеребьёвка уже прошла — новых участников не берём",
      lostProfile: true,
    });
  });

  it("убран — «Организатор убрал тебя», без сценария потерянного профиля, до и после жеребьёвки", () => {
    for (const drawn of [true, false]) {
      expect(closedInvite({ drawn, removed: true })).toEqual({
        text: "Организатор убрал тебя из этой игры",
        lostProfile: false,
      });
    }
  });

  it("до жеребьёвки и не убран — вступить можно", () => {
    expect(closedInvite({ drawn: false, removed: false })).toBeNull();
  });

  it("«я в этой игре» — сообщение из имени в поле", () => {
    expect(lostProfileMessage({ name: " Азамат К. ", title: "Офис" })).toBe(
      "Я в Тайном Санте «Офис», но телефон потерял мой профиль. Убери, пожалуйста, мой старый профиль «Азамат К.», чтобы моего подопечного взял другой Санта",
    );
    for (const name of [undefined, null, "", "  "]) {
      expect(lostProfileMessage({ name, title: "Офис" })).toBe(
        "Я в Тайном Санте «Офис», но телефон потерял мой профиль. Убери, пожалуйста, мой старый профиль, чтобы моего подопечного взял другой Санта",
      );
    }
    expect(lostProfileHint("Данияр")).toBe(
      "Напиши организатору (Данияр): старый профиль уберут из игры, и твоего подопечного возьмёт другой Санта",
    );
    expect(lostProfileHint()).toMatch(/^Напиши организатору: /);
  });
});
