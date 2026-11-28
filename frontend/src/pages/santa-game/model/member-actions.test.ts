import { describe, expect, it } from "vitest";

import {
  canRemoveMember,
  handOverCandidates,
  handOverCopy,
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

describe("передать роль организатора (S04)", () => {
  const members = [
    { id: "u_owner", joined: true },
    { id: "u_1", joined: true },
    { id: "u_2", joined: false },
    { id: "u_3", joined: true },
  ] as never;

  it("кому — вступившие, кроме себя; не организатору — никому", () => {
    expect(
      handOverCandidates({ members, role: "owner" }, "u_owner").map(
        (member) => member.id,
      ),
    ).toEqual(["u_1", "u_3"]);
    expect(handOverCandidates({ members, role: "participant" }, "u_1")).toEqual(
      [],
    );
  });

  it("подтверждение до и после жеребьёвки — без падежа и про тайну пар", () => {
    expect(handOverCopy({ name: "Нурай", drawn: false })).toEqual({
      title: "Передать игру Нурай?",
      description:
        "Нурай сможет провести жеребьёвку, менять условия и убирать участников. Кто кому дарит, по-прежнему не увидит никто",
    });
    expect(handOverCopy({ name: "Нурай", drawn: true }).description).toBe(
      "Нурай сможет переносить обмен подарками и убирать участников. Кто кому дарит, по-прежнему не увидит никто",
    );
  });
});
