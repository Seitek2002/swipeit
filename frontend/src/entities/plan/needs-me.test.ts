import { describe, expect, it } from "vitest";

import { planNeedsMe } from "./needs-me";

const plan = (patch: Partial<Parameters<typeof planNeedsMe>[0]> = {}) => ({
  participantIds: ["me", "a"],
  finishedIds: [] as string[],
  status: "swiping" as const,
  votes: {} as Record<string, string>,
  ...patch,
});

describe("planNeedsMe (Q09)", () => {
  it("не долистал — «Ждём тебя»", () => {
    expect(planNeedsMe(plan(), "me", null)).toBe("swipe");
    expect(planNeedsMe(plan({ finishedIds: ["me"] }), "me", null)).toBeNull();
  });

  it("голосуют, а моего голоса нет — «Твой голос»", () => {
    const voting = plan({ status: "results", votes: { a: "x" } });
    expect(planNeedsMe(voting, "me", "results")).toBe("vote");
    expect(
      planNeedsMe({ ...voting, votes: { a: "x", me: "x" } }, "me", "results"),
    ).toBeNull();
  });

  it("итоги или решение, а я их не открывал — «Итоги готовы»; открыл — гаснет", () => {
    expect(planNeedsMe(plan({ status: "results" }), "me", null)).toBe(
      "results",
    );
    expect(
      planNeedsMe(plan({ status: "results" }), "me", "results"),
    ).toBeNull();
    expect(planNeedsMe(plan({ status: "decided" }), "me", "results")).toBe(
      "results",
    );
    expect(
      planNeedsMe(plan({ status: "decided" }), "me", "decided"),
    ).toBeNull();
  });

  it("лобби, чужой план — ничего", () => {
    expect(planNeedsMe(plan({ status: "lobby" }), "me", null)).toBeNull();
    expect(planNeedsMe(plan(), "stranger", null)).toBeNull();
  });
});
