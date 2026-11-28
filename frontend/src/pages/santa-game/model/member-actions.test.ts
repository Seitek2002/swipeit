import { describe, expect, it } from "vitest";

import {
  canRemoveMember,
  leaveAction,
  removeMemberCopy,
} from "./member-actions";

const game = (status: "drawn" | "gathering") =>
  ({ ownerId: "u_owner", status }) as never;
const me = { bought: false, envelope: "ready", ward: null } as const;

describe("убрать участника (Q05, R05)", () => {
  it("крестик — только у организатора, не на себе, и после жеребьёвки тоже", () => {
    for (const status of ["gathering", "drawn"] as const) {
      const view = { game: game(status) };
      expect(canRemoveMember(view, "u_owner", "u_1")).toBe(true);
      expect(canRemoveMember(view, "u_owner", "u_owner")).toBe(false);
      expect(canRemoveMember(view, "u_1", "u_2")).toBe(false);
    }
  });

  it("после жеребьёвки подтверждение говорит про новое письмо и тайну пар", () => {
    expect(
      removeMemberCopy({ name: "Азамат", gameTitle: "Офис", drawn: true }),
    ).toEqual({
      title: "Убрать после жеребьёвки?",
      description:
        "Азамат выйдет из игры. Подопечного возьмёт другой Санта и получит новое письмо. Кто кому дарит, по-прежнему не увидит никто",
    });
    expect(
      removeMemberCopy({ name: "Азамат", gameTitle: "Офис", drawn: false }),
    ).toEqual({
      title: "Убрать из игры?",
      description:
        "Азамат не будет участвовать в «Офис» и не сможет вступить снова",
    });
  });
});

describe("выйти из игры (Q05, R05)", () => {
  it("до жеребьёвки — «Выйти» у участника и позванного", () => {
    expect(
      leaveAction({ game: game("gathering"), me, role: "participant" }),
    ).toBe("leave");
    expect(
      leaveAction({ game: game("gathering"), me: null, role: "invited" }),
    ).toBe("leave");
  });

  it("после жеребьёвки — подпись «напиши организатору», без кнопки", () => {
    expect(leaveAction({ game: game("drawn"), me, role: "participant" })).toBe(
      "ask-owner",
    );
    // Жеребьёвка прошла без меня — подписи нет.
    expect(
      leaveAction({ game: game("drawn"), me: null, role: "invited" }),
    ).toBeNull();
  });

  it("организатору и гостю — ничего", () => {
    for (const status of ["gathering", "drawn"] as const) {
      expect(leaveAction({ game: game(status), me, role: "owner" })).toBeNull();
      expect(
        leaveAction({ game: game(status), me: null, role: "guest" }),
      ).toBeNull();
    }
  });
});
