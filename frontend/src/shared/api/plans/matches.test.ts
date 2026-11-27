import { describe, expect, it } from "vitest";

import { computeMatches } from "./matches";
import type { PlanSession } from "./types";

// Совпадения плана: правила «все» и «большинство», «почти», сортировка.
type Swipes = PlanSession["swipes"];

const plan = (
  matchRule: PlanSession["matchRule"],
  swipes: Swipes,
  participantIds = ["a", "b", "c", "d"],
  deck = ["x1", "x2", "x3", "x4"],
) => ({ deck, matchRule, participantIds, swipes });

// Каждый участник — строка лайков по колоде: "LLP-" → x1, x2 like, x3 pass.
const fromRows = (rows: Record<string, string>): Swipes =>
  Object.fromEntries(
    Object.entries(rows).map(([userId, row]) => [
      userId,
      Object.fromEntries(
        [...row].flatMap((mark, index): Array<[string, "like" | "pass"]> => {
          const id = `x${index + 1}`;
          if (mark === "L") return [[id, "like"]];
          if (mark === "P") return [[id, "pass"]];
          return [];
        }),
      ),
    ]),
  );

describe("computeMatches", () => {
  it("«все»: совпадение — только когда лайкнули все, «почти» — большинство", () => {
    const swipes = fromRows({
      a: "LLLP",
      b: "LLPP",
      c: "LLL-",
      d: "LPL-",
    });
    const result = computeMatches(plan("all", swipes));
    expect(result.matches).toEqual([{ activityId: "x1", likes: 4 }]);
    // x2 и x3 — по 3 из 4 (больше половины), x4 — никто.
    expect(result.almost).toEqual([
      { activityId: "x2", likes: 3 },
      { activityId: "x3", likes: 3 },
    ]);
    expect(result.likesById).toEqual({ x1: 4, x2: 3, x3: 3, x4: 0 });
  });

  it("«большинство»: строго больше половины, «почти» нет", () => {
    const swipes = fromRows({
      a: "LLLP",
      b: "LLPL",
      c: "LPP-",
      d: "PPL-",
    });
    const result = computeMatches(plan("majority", swipes));
    // x2 и x3 — по 2 из 4: ровно половина не в счёт.
    expect(result.matches).toEqual([{ activityId: "x1", likes: 3 }]);
    expect(result.almost).toEqual([]);
  });

  it("сортировка по лайкам, при равенстве — порядок колоды", () => {
    const swipes = fromRows({
      a: "LLLL",
      b: "PLLL",
      c: "PLPL",
      d: "PPPL",
    });
    const result = computeMatches(
      plan("majority", swipes, ["a", "b", "c", "d"], ["x3", "x1", "x4", "x2"]),
    );
    expect(result.matches.map((m) => m.activityId)).toEqual(["x4", "x2"]);
    const tie = computeMatches(
      plan("majority", fromRows({ a: "LL", b: "LL", c: "PP" }), [
        "a",
        "b",
        "c",
      ]),
    );
    // x1 и x2 — по 2 голоса: первым тот, что раньше в колоде.
    expect(tie.matches.map((m) => m.activityId)).toEqual(["x1", "x2"]);
  });

  it("пустой план и пустая колода — без совпадений", () => {
    expect(computeMatches(plan("all", {}))).toEqual({
      matches: [],
      almost: [],
      likesById: { x1: 0, x2: 0, x3: 0, x4: 0 },
    });
    expect(computeMatches(plan("all", {}, [], []))).toEqual({
      matches: [],
      almost: [],
      likesById: {},
    });
  });

  it("лайки не-участников и пропавшие из каталога занятия не в счёт", () => {
    const swipes = fromRows({ a: "LL", b: "LL", stranger: "LL" });
    const result = computeMatches(plan("all", swipes, ["a", "b"]), [
      { id: "x2" },
    ]);
    expect(result.matches).toEqual([{ activityId: "x2", likes: 2 }]);
    expect(result.likesById).toEqual({ x2: 2 });
  });
});
