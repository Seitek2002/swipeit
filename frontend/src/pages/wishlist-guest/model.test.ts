import { describe, expect, it } from "vitest";

import { guestNextStep } from "./model";

describe("следующий шаг гостя после брони (P01)", () => {
  it("без профиля — собрать свой вишлист", () => {
    expect(guestNextStep({ hasProfile: false, shareUnlocked: false })).toBe(
      "collect",
    );
  });

  it("профиль, отправка ещё закрыта (меньше 5 «Хочу») — собрать", () => {
    expect(guestNextStep({ hasProfile: true, shareUnlocked: false })).toBe(
      "collect",
    );
  });

  it("отправка открыта — отправить свой в ответ", () => {
    expect(guestNextStep({ hasProfile: true, shareUnlocked: true })).toBe(
      "send",
    );
  });
});
