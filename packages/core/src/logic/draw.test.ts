import { describe, expect, it } from "vitest";

import { createSeededRandom } from "./random";
import { drawAssignments, drawIssueOf, repairAfterLeave } from "./draw";

// drawAssignments (TECH_SPEC §6): 3–30 участников, исключения, невозможные
// случаи, никто не дарит себе — 1000 прогонов.

const idsOf = (count: number) =>
  Array.from({ length: count }, (_, index) => `u_${index}`);

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

// Каждый дарит ровно одному, каждому дарит ровно один, себе — никто,
// исключённые пары — ни в одну сторону.
const expectValid = (
  ids: string[],
  assignments: Record<string, string>,
  exclusions: Array<[string, string]> = [],
) => {
  expect(Object.keys(assignments).sort()).toEqual([...ids].sort());
  expect(Object.values(assignments).sort()).toEqual([...ids].sort());
  const banned = new Set(exclusions.map(([a, b]) => pairKey(a, b)));
  for (const [santa, ward] of Object.entries(assignments)) {
    expect(ward).not.toBe(santa);
    expect(banned.has(pairKey(santa, ward))).toBe(false);
  }
};

const NAMES: Record<string, string> = {
  u_azamat: "Азамату",
  u_nurai: "Нурай",
  u_daniyar: "Данияру",
  u_timur: "Тимуру",
};
const describeName = (id: string) => NAMES[id] ?? id;

describe("drawAssignments", () => {
  it("от 3 до 30 участников — у каждого ровно один подопечный", () => {
    const random = createSeededRandom("draw-sizes");
    for (let count = 3; count <= 30; count += 1) {
      const ids = idsOf(count);
      for (let run = 0; run < 20; run += 1) {
        expectValid(ids, drawAssignments(ids, [], random));
      }
    }
  });

  it("1000 прогонов — никто не дарит сам себе", () => {
    const random = createSeededRandom("draw-1000");
    for (let run = 0; run < 1000; run += 1) {
      const ids = idsOf(3 + (run % 28));
      const assignments = drawAssignments(ids, [], random);
      for (const [santa, ward] of Object.entries(assignments)) {
        expect(ward).not.toBe(santa);
      }
    }
  });

  it("исключения соблюдаются в обе стороны", () => {
    const random = createSeededRandom("draw-exclusions");
    const ids = idsOf(6);
    // Две семейные пары и ещё одно «не дарят друг другу».
    const exclusions: Array<[string, string]> = [
      ["u_0", "u_1"],
      ["u_2", "u_3"],
      ["u_4", "u_0"],
    ];
    for (let run = 0; run < 1000; run += 1) {
      expectValid(ids, drawAssignments(ids, exclusions, random), exclusions);
    }
  });

  it("30 человек с соседями в исключениях — решение находится", () => {
    const random = createSeededRandom("draw-dense");
    const ids = idsOf(30);
    // Каждый не дарит двум соседям по кругу — у каждого 26 вариантов.
    const exclusions = ids.flatMap((id, index): Array<[string, string]> => [
      [id, ids[(index + 1) % 30] ?? id],
      [id, ids[(index + 2) % 30] ?? id],
    ]);
    for (let run = 0; run < 100; run += 1) {
      expectValid(ids, drawAssignments(ids, exclusions, random), exclusions);
    }
  });

  it("единственный вариант — находится, даже если перебором его легко упустить", () => {
    // У каждого ровно один вариант: u_0 ↔ u_3, u_1 ↔ u_2.
    const ids = idsOf(4);
    const exclusions: Array<[string, string]> = [
      ["u_0", "u_1"],
      ["u_0", "u_2"],
      ["u_1", "u_3"],
      ["u_2", "u_3"],
    ];
    const random = createSeededRandom("draw-unique");
    for (let run = 0; run < 200; run += 1) {
      expectValid(ids, drawAssignments(ids, exclusions, random), exclusions);
    }
  });

  it("результат случайный: разные прогоны дают разные пары", () => {
    const random = createSeededRandom("draw-variety");
    const ids = idsOf(5);
    const seen = new Set<string>();
    for (let run = 0; run < 200; run += 1) {
      seen.add(JSON.stringify(drawAssignments(ids, [], random)));
    }
    // Перестановок без неподвижных точек из 5 — 44.
    expect(seen.size).toBeGreaterThan(20);
  });

  it("меньше 3 участников — CONFLICT", () => {
    const random = createSeededRandom("draw-min");
    for (const ids of [[], ["u_0"], ["u_0", "u_1"], ["u_0", "u_0", "u_1"]]) {
      expect(() => drawAssignments(ids, [], random)).toThrow(
        expect.objectContaining({
          code: "CONFLICT",
          message: "Нужно хотя бы 3 участника — позови ещё друзей",
        }),
      );
    }
  });

  it("кому-то некому дарить — CONFLICT с именем", () => {
    const random = createSeededRandom("draw-stuck");
    const ids = ["u_azamat", "u_nurai", "u_daniyar"];
    expect(() =>
      drawAssignments(
        ids,
        [
          ["u_azamat", "u_nurai"],
          ["u_daniyar", "u_azamat"],
        ],
        random,
        describeName,
      ),
    ).toThrow(
      expect.objectContaining({
        code: "CONFLICT",
        status: 409,
        message: "Слишком много исключений: Азамату некому дарить",
      }),
    );
  });

  it("варианты у всех есть, но на всех не хватает — CONFLICT", () => {
    const random = createSeededRandom("draw-hall");
    // Азамат и Нурай могут дарить только Данияру.
    const ids = ["u_azamat", "u_nurai", "u_daniyar"];
    const exclusions: Array<[string, string]> = [["u_azamat", "u_nurai"]];
    for (let run = 0; run < 50; run += 1) {
      expect(() =>
        drawAssignments(ids, exclusions, random, describeName),
      ).toThrow(
        expect.objectContaining({
          code: "CONFLICT",
          message: expect.stringMatching(
            /^Слишком много исключений: (Азамату|Нурай|Данияру) некому дарить$/,
          ),
        }),
      );
    }
    // Четверо: трое могут дарить только Тимуру.
    const four = [...ids, "u_timur"];
    expect(
      drawIssueOf(
        four,
        [
          ["u_azamat", "u_nurai"],
          ["u_azamat", "u_daniyar"],
          ["u_nurai", "u_daniyar"],
        ],
        describeName,
      ),
    ).toMatch(/^Слишком много исключений: .+ некому дарить$/);
  });

  it("повторы, пары с самим собой и с теми, кого нет в игре, не мешают", () => {
    const random = createSeededRandom("draw-noise");
    const ids = idsOf(3);
    const exclusions: Array<[string, string]> = [
      ["u_0", "u_0"],
      ["u_1", "u_outsider"],
    ];
    expectValid(
      ids,
      drawAssignments([...ids, "u_1"], exclusions, random),
      exclusions,
    );
  });

  it("drawIssueOf: null, когда можно, и причина, когда нельзя", () => {
    expect(drawIssueOf(idsOf(3), [])).toBeNull();
    expect(drawIssueOf(idsOf(2), [])).toBe(
      "Нужно хотя бы 3 участника — позови ещё друзей",
    );
    expect(
      drawIssueOf(
        ["u_azamat", "u_nurai", "u_daniyar"],
        [
          ["u_nurai", "u_azamat"],
          ["u_nurai", "u_daniyar"],
        ],
        describeName,
      ),
    ).toBe("Слишком много исключений: Нурай некому дарить");
  });
});

describe("починка пар после ухода (Q05)", () => {
  it("круг A→B→C→A, ушёл B — A дарит C, C дарит A", () => {
    const result = repairAfterLeave({ A: "B", B: "C", C: "A" }, "B");
    expect(result).toEqual({
      assignments: { A: "C", C: "A" },
      rewired: "A",
      orphaned: null,
    });
  });

  it("пятеро, ушёл D — меняется только пара его Санты", () => {
    const before = { A: "B", B: "C", C: "D", D: "E", E: "A" };
    const result = repairAfterLeave(before, "D");
    expect(result.assignments).toEqual({ A: "B", B: "C", C: "E", E: "A" });
    expect(result.rewired).toBe("C");
  });

  it("пара двоих A↔B в игре на четверых, ушёл B — у A нет подопечного, C↔D как были", () => {
    const result = repairAfterLeave({ A: "B", B: "A", C: "D", D: "C" }, "B");
    expect(result).toEqual({
      assignments: { C: "D", D: "C" },
      rewired: null,
      orphaned: "A",
    });
  });
});
