import { describe, expect, it } from "vitest";

import type { SantaSummary } from "@/shared/api";

import { drawIsDue, santaTabDot } from "./tab-dot";

// Игра «Офис, Новый год» глазами организатора: все в сборе, жеребьёвка
// вручную.
const allIn = {
  role: "owner",
  drawIssue: null,
  game: { status: "gathering", drawAt: undefined },
  me: { envelope: "sealed", bought: false, ward: null },
} as unknown as SantaSummary;

const withPatch = (patch: {
  drawIssue?: null | string;
  game?: Partial<SantaSummary["game"]>;
  me?: SantaSummary["me"];
  role?: SantaSummary["role"];
}) =>
  ({
    ...allIn,
    ...patch,
    game: { ...allIn.game, ...patch.game },
  }) as SantaSummary;

describe("точка на табе «Санта» (X10)", () => {
  it("организатор, все в сборе, жеребьёвка вручную — пора тянуть пары", () => {
    expect(drawIsDue(allIn)).toBe(true);
    expect(santaTabDot([allIn])).toEqual({
      drawDue: true,
      envelopeReady: false,
    });
  });

  it("не организатор, кого-то ждём, назначена дата — не зовём", () => {
    expect(drawIsDue(withPatch({ role: "participant" }))).toBe(false);
    expect(
      drawIsDue(withPatch({ drawIssue: "Ждём, пока вступят: Нурай" })),
    ).toBe(false);
    expect(
      drawIsDue(withPatch({ game: { drawAt: "2026-12-20T14:00:00.000Z" } })),
    ).toBe(false);
  });

  it("после жеребьёвки — как раньше, только письмо", () => {
    const drawn = withPatch({
      game: { status: "drawn" },
      me: { envelope: "ready", bought: false, ward: null },
    });
    expect(santaTabDot([drawn])).toEqual({
      drawDue: false,
      envelopeReady: true,
    });
    const opened = withPatch({
      game: { status: "drawn" },
      me: { envelope: "opened", bought: false, ward: null },
    });
    expect(santaTabDot([opened])).toEqual({
      drawDue: false,
      envelopeReady: false,
    });
  });

  it("две причины в разных играх — обе", () => {
    const ready = withPatch({
      role: "participant",
      game: { status: "drawn" },
      me: { envelope: "ready", bought: false, ward: null },
    });
    expect(santaTabDot([allIn, ready])).toEqual({
      drawDue: true,
      envelopeReady: true,
    });
  });
});
