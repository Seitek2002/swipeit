import { describe, expect, it } from "vitest";

import {
  askOwnerToRemove,
  canRemoveMember,
  handOverCandidates,
  handOverCopy,
  leaveAction,
  removeMemberCopy,
  removedToast,
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

describe("тост после «Убрать» (Z08)", () => {
  it("до жеребьёвки — кто вышел, после — что будет с парой, без имён Сант", () => {
    expect(removedToast({ name: "Алина", drawn: false })).toBe(
      "Алина больше не в игре",
    );
    expect(removedToast({ name: "Бекзат", drawn: true })).toBe(
      "Бекзат больше не в игре. Подопечного возьмёт другой Санта — ему придёт новое письмо",
    );
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

  it("подпись называет организатора в скобках (Z02)", () => {
    expect(askOwnerToRemove("Данияр")).toBe(
      "Не сможешь участвовать — напиши организатору (Данияр): тебя уберут из игры, и твой подопечный не останется без подарка",
    );
    expect(askOwnerToRemove()).toBe(
      "Не сможешь участвовать — напиши организатору: тебя уберут из игры, и твой подопечный не останется без подарка",
    );
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
