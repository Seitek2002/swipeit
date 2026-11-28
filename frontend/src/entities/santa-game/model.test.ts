import { describe, expect, it } from "vitest";

import { ALL_IN, drawLabel, gatheringStatus } from "./model";

const game = { drawAt: undefined } as unknown as Parameters<
  typeof drawLabel
>[0]["game"];

describe("строка сбора Санты (W09)", () => {
  it("нечего ждать — «Все в сборе», и под конвертом, и в списке", () => {
    expect(gatheringStatus({ drawIssue: null })).toBe(ALL_IN);
    expect(drawLabel({ drawIssue: null, game })).toBe(ALL_IN);
  });

  it("ждём или мало людей — причина одной строкой, без «когда все соберутся»", () => {
    const view = { drawIssue: "Ждём, пока вступят: Нурай", game };
    expect(drawLabel(view)).toBe("Ждём, пока вступят: Нурай");
    expect(gatheringStatus(view)).toBe("Ждём, пока вступят: Нурай");
  });

  it("назначена дата — под конвертом дата", () => {
    const dated = { ...game, drawAt: "2026-12-20T14:00:00.000Z" };
    expect(drawLabel({ drawIssue: null, game: dated })).toMatch(
      /^Жеребьёвка 20\sдекабря/,
    );
  });
});
