import { describe, expect, it } from "vitest";

import { DRAW_FAILED_WAIT, drawFailedNote, drawFailedNow } from "./draw-failed";

const failed = {
  at: "2026-12-01T06:00:00.000Z",
  reason: "Нужно хотя бы 3 участника — позови ещё друзей",
};

const view = (
  role: "invited" | "owner" | "participant",
  status: "drawn" | "gathering" = "gathering",
  drawFailed: null | typeof failed = failed,
) => ({ role, drawFailed, game: { status } }) as const;

describe("жеребьёвка по дате не прошла (R08)", () => {
  it("организатору — две строки: почему и что делать (Y09)", () => {
    expect(drawFailedNote(view("owner"))).toBe(
      "Нужно хотя бы 3 участника. Позови друзей или поменяй дату",
    );
    const stuck = {
      ...failed,
      reason: "Слишком много исключений: Азамату некому дарить",
    };
    expect(drawFailedNote(view("owner", "gathering", stuck))).toBe(
      "Слишком много исключений: Азамату некому дарить. Убери исключение или поменяй дату",
    );
    expect(
      drawFailedNote(view("owner", "gathering", { ...failed, reason: "" })),
    ).toBe("Поменяй дату");
  });

  it("участнику и позванному — ждём организатора", () => {
    expect(drawFailedNote(view("participant"))).toBe(DRAW_FAILED_WAIT);
    expect(drawFailedNote(view("invited"))).toBe(DRAW_FAILED_WAIT);
  });

  it("отметки нет или жеребьёвка уже прошла — ничего", () => {
    expect(drawFailedNote(view("owner", "gathering", null))).toBeNull();
    expect(drawFailedNote(view("owner", "drawn"))).toBeNull();
    expect(drawFailedNow(view("participant", "drawn"))).toBe(false);
    expect(drawFailedNow(view("participant"))).toBe(true);
  });

  it("точка в конце причины не удваивается", () => {
    const withDot = { ...failed, reason: "Азамату некому дарить." };
    expect(drawFailedNote(view("owner", "gathering", withDot))).toBe(
      "Азамату некому дарить. Убери исключение или поменяй дату",
    );
  });
});
