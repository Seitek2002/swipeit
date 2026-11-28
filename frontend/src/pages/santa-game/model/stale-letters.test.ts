import { describe, expect, it } from "vitest";

import {
  STALE_LETTER_DAYS,
  sealedLetterText,
  staleLetters,
} from "./stale-letters";

const DAY = 24 * 60 * 60 * 1000;
const DRAWN_AT = Date.UTC(2026, 11, 1, 9);

const member = (id: string, opened: boolean, joined = true) =>
  ({ id, name: id, avatarColor: "mint", joined, opened }) as never;

const view = (
  status: "drawn" | "gathering",
  drawnAt: null | string = new Date(DRAWN_AT).toISOString(),
) => ({
  game: { status, drawnAt: drawnAt ?? undefined } as never,
  members: [
    member("u_owner", true),
    member("u_azamat", false),
    member("u_nurai", true),
    member("u_timur", false),
  ],
});

describe("staleLetters (S04)", () => {
  it("до жеребьёвки и без drawnAt — пусто", () => {
    expect(staleLetters(view("gathering"), DRAWN_AT + 10 * DAY).size).toBe(0);
    expect(staleLetters(view("drawn", null), DRAWN_AT + 10 * DAY).size).toBe(0);
  });

  it("меньше 2 полных дней с жеребьёвки — пусто", () => {
    expect(staleLetters(view("drawn"), DRAWN_AT).size).toBe(0);
    expect(
      staleLetters(view("drawn"), DRAWN_AT + STALE_LETTER_DAYS * DAY - 1).size,
    ).toBe(0);
  });

  it("2 дня и больше — вступившие с невскрытым письмом и сколько дней", () => {
    expect(staleLetters(view("drawn"), DRAWN_AT + 2 * DAY)).toEqual(
      new Map([
        ["u_azamat", 2],
        ["u_timur", 2],
      ]),
    );
    expect(staleLetters(view("drawn"), DRAWN_AT + 3 * DAY + 5)).toEqual(
      new Map([
        ["u_azamat", 3],
        ["u_timur", 3],
      ]),
    );
  });

  it("невступивших не считает; все открыли — пусто", () => {
    const opened = {
      game: view("drawn").game,
      members: [member("u_1", true), member("u_2", false, false)],
    };
    expect(staleLetters(opened, DRAWN_AT + 5 * DAY).size).toBe(0);
  });
});

describe("sealedLetterText", () => {
  it("без дней — как было, с днями — числительное", () => {
    expect(sealedLetterText()).toBe("письмо не открыто");
    expect(sealedLetterText(2)).toBe("письмо не открыто 2 дня");
    expect(sealedLetterText(5)).toBe("письмо не открыто 5 дней");
    expect(sealedLetterText(21)).toBe("письмо не открыто 21 день");
  });
});
