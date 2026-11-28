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
  it("организатору — причина и что дальше", () => {
    expect(drawFailedNote(view("owner"))).toBe(
      "Жеребьёвка по дате не прошла. Нужно хотя бы 3 участника — позови ещё друзей. Как только состав или исключения изменятся, попробуем снова — или поменяй дату в «Изменить игру»",
    );
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
    expect(drawFailedNote(view("owner", "gathering", withDot))).toContain(
      "Азамату некому дарить. Как только",
    );
  });
});
