import { describe, expect, it } from "vitest";

import { isApiError } from "./mock-server/errors";
import { errorCodeOf, remoteErrorFromResponse } from "./remote-errors";

describe("remoteErrorFromResponse", () => {
  it("JSON сервера { code, message } — как есть", () => {
    const error = remoteErrorFromResponse(409, {
      code: "NAME_REQUIRED",
      message: "Сначала напиши, как тебя зовут",
      requestId: "r1",
    });
    expect(isApiError(error)).toBe(true);
    expect(error.status).toBe(409);
    expect(error.code).toBe("NAME_REQUIRED");
    expect(error.message).toBe("Сначала напиши, как тебя зовут");
  });

  it("новые коды remote: UNAUTHORIZED, RATE_LIMITED, INTERNAL", () => {
    for (const [status, code] of [
      [401, "UNAUTHORIZED"],
      [429, "RATE_LIMITED"],
      [500, "INTERNAL"],
    ] as const) {
      expect(
        remoteErrorFromResponse(status, { code, message: "Текст" }).code,
      ).toBe(code);
    }
  });

  it("не наше тело — код по статусу и общий текст", () => {
    expect(remoteErrorFromResponse(401, null).code).toBe("UNAUTHORIZED");
    expect(remoteErrorFromResponse(401, null).message).toBe(
      "Сессия закончилась",
    );
    expect(remoteErrorFromResponse(404, "<html>").code).toBe("NOT_FOUND");
    expect(remoteErrorFromResponse(413, null).code).toBe("VALIDATION");
    expect(remoteErrorFromResponse(500, null).code).toBe("INTERNAL");
    // Прокси без сервера за ним — сбой связи, его повторяют.
    expect(remoteErrorFromResponse(502, null).code).toBe("OFFLINE");
    expect(remoteErrorFromResponse(503, {}).message).toBe(
      "Нет связи с сервером. Попробуй ещё раз",
    );
  });

  it("неизвестный код — по статусу, но текст сервера остаётся", () => {
    const error = remoteErrorFromResponse(403, {
      code: "SOMETHING_NEW",
      message: "Нельзя",
    });
    expect(error.code).toBe("FORBIDDEN");
    expect(error.message).toBe("Нельзя");
  });
});

describe("код ошибки для человека (S08)", () => {
  const REQUEST_ID = "A1B2C3D4-5e6f-4a7b-8c9d-0e1f2a3b4c5d";

  it("INTERNAL с requestId — код из 8 символов в тексте и requestId в ошибке", () => {
    const error = remoteErrorFromResponse(500, {
      code: "INTERNAL",
      message: "Что-то пошло не так. Попробуй ещё раз",
      requestId: REQUEST_ID,
    });
    expect(error.code).toBe("INTERNAL");
    expect(error.requestId).toBe(REQUEST_ID);
    expect(error.message).toBe(
      "Что-то пошло не так. Попробуй ещё раз · код a1b2c3d4",
    );
    expect(errorCodeOf(error)).toBe("a1b2c3d4");
  });

  it("остальные коды — текст как есть, но requestId сохранён", () => {
    const error = remoteErrorFromResponse(409, {
      code: "CONFLICT",
      message: "Жеребьёвка уже прошла",
      requestId: REQUEST_ID,
    });
    expect(error.message).toBe("Жеребьёвка уже прошла");
    expect(errorCodeOf(error)).toBe("a1b2c3d4");
  });

  it("тело не наше — requestId из заголовка; нет нигде — без кода", () => {
    const fromHeader = remoteErrorFromResponse(500, null, REQUEST_ID);
    expect(fromHeader.message).toMatch(/ · код a1b2c3d4$/);
    const bare = remoteErrorFromResponse(500, null);
    expect(bare.message).not.toContain("код");
    expect(errorCodeOf(bare)).toBeNull();
    expect(errorCodeOf(new Error("x"))).toBeNull();
  });
});
