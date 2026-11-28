import { describe, expect, it } from "vitest";

import {
  type SantaPair,
  canAddPair,
  pairBlocked,
  pairsAmong,
  santaPeople,
  withPair,
  withoutPair,
} from "./exclusions";

const people = ["me", "a", "b", "c"].map((id) => ({ id }));

describe("исключения (R03)", () => {
  it("пара в обратную сторону — та же: не повторяется и убирается", () => {
    const list: SantaPair[] = [["a", "b"]];
    expect(withPair(list, ["b", "a"])).toEqual([["a", "b"]]);
    expect(withPair(list, ["a", "c"])).toEqual([
      ["a", "b"],
      ["a", "c"],
    ]);
    expect(withoutPair(list, ["b", "a"])).toEqual([]);
  });

  it("пары тех, кого в игре уже нет, не показываем", () => {
    expect(
      pairsAmong(
        [
          ["a", "b"],
          ["a", "gone"],
        ],
        people,
      ),
    ).toEqual([["a", "b"]]);
  });

  it("в шторке нельзя выбрать того, с кем пара уже есть, и третьего", () => {
    const list: SantaPair[] = [["a", "b"]];
    // Никто не выбран — можно всех.
    expect(people.some(({ id }) => pairBlocked(id, [], list))).toBe(false);
    // Выбран a — b уже в паре с ним.
    expect(pairBlocked("b", ["a"], list)).toBe(true);
    expect(pairBlocked("c", ["a"], list)).toBe(false);
    expect(pairBlocked("a", ["a"], list)).toBe(false);
    // Двое выбраны — остальные заняты, выбранных можно снять.
    expect(pairBlocked("me", ["a", "c"], list)).toBe(true);
    expect(pairBlocked("c", ["a", "c"], list)).toBe(false);
  });

  it("новую пару составить можно, пока не все пары исключены", () => {
    expect(canAddPair([{ id: "me" }], [])).toBe(false);
    expect(canAddPair([{ id: "me" }, { id: "a" }], [])).toBe(true);
    expect(canAddPair([{ id: "me" }, { id: "a" }], [["a", "me"]])).toBe(false);
    expect(canAddPair(people, [["a", "b"]])).toBe(true);
  });
});

describe("люди для исключений — себя «Ты»", () => {
  it("организатор в шторке — «Ты», как в списке участников", () => {
    const members = [
      { id: "me", name: "Айгерим", avatarColor: "mint" },
      { id: "a", name: "Азамат", avatarColor: "rose" },
    ];
    expect(santaPeople(members, "me").map((person) => person.name)).toEqual([
      "Ты",
      "Азамат",
    ]);
    expect(santaPeople(members, null).map((person) => person.name)).toEqual([
      "Айгерим",
      "Азамат",
    ]);
  });
});
