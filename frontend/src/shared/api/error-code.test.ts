import { describe, expect, it } from "vitest";

import { shortErrorCode, splitErrorCode, withErrorCode } from "./error-code";

describe("код ошибки (S08)", () => {
  it("requestId → первые 8 букв и цифр строчными", () => {
    expect(shortErrorCode("A1B2C3D4-0000-4000-8000-000000000000")).toBe(
      "a1b2c3d4",
    );
    expect(shortErrorCode("ab-cd-ef-12-34")).toBe("abcdef12");
    expect(shortErrorCode("short")).toBeNull();
    expect(shortErrorCode(undefined)).toBeNull();
    expect(shortErrorCode(42)).toBeNull();
  });

  it("текст с кодом делится обратно на фразу и код", () => {
    const text = withErrorCode("Что-то пошло не так", "a1b2c3d4");
    expect(text).toBe("Что-то пошло не так · код a1b2c3d4");
    expect(splitErrorCode(text)).toEqual({
      text: "Что-то пошло не так",
      code: "a1b2c3d4",
    });
  });

  it("обычный текст — без кода, как есть", () => {
    expect(splitErrorCode("Код скопирован")).toEqual({
      text: "Код скопирован",
      code: null,
    });
    // «код» в середине фразы — не код ошибки.
    expect(splitErrorCode("Введи код a1b2c3d4 ещё раз").code).toBeNull();
  });
});
