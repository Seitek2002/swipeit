import { describe, expect, it } from "vitest";

import { computeMatches } from "./matches";
import {
  closeAtDeadline,
  EXTRA_ROUND_MS,
  extendDeadline,
  extendRefusal,
  isTimedOutWithoutResults,
} from "./plan-close";
import type { PlanSession } from "../api/plans/types";

// Закрытие «До даты» по дате и «Продлить на сутки» (auto-tasks-ux-5 Y02).
const NOW = Date.UTC(2026, 10, 28, 6);
const PEOPLE = ["a", "b", "c"];
const DECK = ["x1", "x2"];

// finished — кто долистал (лайкнул обе); остальные свайпнули только x1 пасом.
const swipingPlan = (finished: string[]): PlanSession => ({
  id: "pl_1",
  title: "Выходные",
  ownerId: "a",
  mode: "deadline",
  deadline: new Date(NOW - 1_000).toISOString(),
  status: "swiping",
  participantIds: PEOPLE,
  readyIds: ["a"],
  matchRule: "all",
  filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
  customActivityIds: [],
  deck: DECK,
  swipes: Object.fromEntries(
    PEOPLE.map((id): [string, Record<string, "like" | "pass">] => [
      id,
      finished.includes(id) ? { x1: "like", x2: "like" } : { x1: "pass" },
    ]),
  ),
  finishedIds: finished,
  votes: {},
  createdAt: new Date(NOW - 86_400_000).toISOString(),
});

describe("closeAtDeadline", () => {
  it("1 из 3: итоги по одному — без итогов, «Продлить на сутки»", () => {
    const plan = swipingPlan(["a"]);
    closeAtDeadline(plan);
    expect(plan).toMatchObject({
      status: "results",
      closedEarly: true,
      timedOut: true,
    });
    expect(isTimedOutWithoutResults(plan)).toBe(true);
  });

  it("0 из 3 — тоже без итогов", () => {
    const plan = swipingPlan([]);
    closeAtDeadline(plan);
    expect(isTimedOutWithoutResults(plan)).toBe(true);
  });

  it("2 из 3: считаем только долиставших, пас отстающего не мешает «Все за»", () => {
    const plan = swipingPlan(["a", "b"]);
    closeAtDeadline(plan);
    expect(plan).toMatchObject({ closedEarly: true, timedOut: true });
    expect(isTimedOutWithoutResults(plan)).toBe(false);
    expect(computeMatches(plan).matches.map((m) => m.activityId)).toEqual(DECK);
  });

  it("3 из 3: обычные итоги, без отметок", () => {
    const plan = swipingPlan(PEOPLE);
    plan.closedEarly = true;
    closeAtDeadline(plan);
    expect(plan.status).toBe("results");
    expect(plan.closedEarly).toBeUndefined();
    expect(plan.timedOut).toBeUndefined();
    expect(isTimedOutWithoutResults(plan)).toBe(false);
  });
});

describe("«Продлить на сутки»", () => {
  it("новая дата через сутки, снова колода, отметки сняты, долиставшие — на месте", () => {
    const plan = swipingPlan(["a"]);
    closeAtDeadline(plan);
    expect(extendRefusal(plan)).toBeNull();
    expect(extendDeadline(plan, NOW)).toBe(true);
    expect(plan).toMatchObject({
      status: "swiping",
      deadline: new Date(NOW + EXTRA_ROUND_MS).toISOString(),
      finishedIds: ["a"],
      votes: {},
    });
    expect(plan.closedEarly).toBeUndefined();
    expect(plan.timedOut).toBeUndefined();
    // Повтор — ничего не меняет.
    expect(extendDeadline(plan, NOW + 1_000)).toBe(false);
    expect(plan.deadline).toBe(new Date(NOW + EXTRA_ROUND_MS).toISOString());
  });

  it("нельзя: «Прямо сейчас», лобби, решено, итоги без отстающих", () => {
    expect(extendRefusal({ mode: "live", status: "results" })).toMatch(
      /До даты/,
    );
    expect(extendRefusal({ mode: "deadline", status: "lobby" })).toBeTruthy();
    expect(
      extendRefusal({ mode: "deadline", status: "decided", timedOut: true }),
    ).toBeTruthy();
    expect(extendRefusal({ mode: "deadline", status: "results" })).toBeTruthy();
  });
});
