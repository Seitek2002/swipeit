import { describe, expect, it } from "vitest";

import { type PlanSession, planStatus } from "./model";

const plan = (patch: Partial<PlanSession> = {}): PlanSession => ({
  id: "pl_1",
  title: "Корпоратив",
  ownerId: "me",
  mode: "live",
  status: "results",
  participantIds: ["me", "a", "b"],
  readyIds: ["me"],
  matchRule: "all",
  filters: {
    categories: [],
    budgetPerPerson: { min: 0, max: null },
    deckSize: null,
  },
  customActivityIds: [],
  deck: ["x", "y"],
  swipes: {},
  finishedIds: ["me", "a", "b"],
  votes: {},
  createdAt: "2026-11-28T10:00:00.000Z",
  ...patch,
});

// Статус билетика в списке планов: новые итоги и увиденные (ux-5, ux-6).
describe("planStatus — итоги", () => {
  it("не открывали — «Итоги готовы»", () => {
    expect(planStatus(plan()).text).toBe("Итоги готовы");
    expect(planStatus(plan(), undefined, { resultsSeen: false }).text).toBe(
      "Итоги готовы",
    );
  });

  it("уже видели — «Решаем, что делаем»", () => {
    expect(planStatus(plan(), undefined, { resultsSeen: true }).text).toBe(
      "Решаем, что делаем",
    );
  });

  it("уже видели, а голосование идёт — «Идёт голосование»", () => {
    expect(
      planStatus(plan({ votes: { a: "x" } }), undefined, { resultsSeen: true })
        .text,
    ).toBe("Идёт голосование");
  });

  it("решение не зависит от отметки", () => {
    const decided = plan({
      status: "decided",
      decision: {
        activityId: "x",
        method: "random",
        decidedAt: "2026-11-28T11:00:00.000Z",
      },
    });
    expect(planStatus(decided, "Кино", { resultsSeen: true }).text).toBe(
      "Решено: Кино",
    );
  });
});
