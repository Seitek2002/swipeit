import { describe, expect, it } from "vitest";

import { createEmptyDb, parseDb } from "./db";

describe("чтение базы", () => {
  it("нет данных — null (база создаётся из сида)", () => {
    expect(parseDb(null)).toBeNull();
    expect(parseDb("")).toBeNull();
  });

  it("битый JSON — broken (база пересоздаётся, тост)", () => {
    expect(parseDb("{сломано")).toBe("broken");
  });

  it("JSON не по схеме — broken", () => {
    expect(parseDb(JSON.stringify({ version: 1, users: "не объект" }))).toBe(
      "broken",
    );
    expect(parseDb(JSON.stringify({ ...createEmptyDb(), version: 2 }))).toBe(
      "broken",
    );
  });

  it("правильная база читается как есть", () => {
    const db = createEmptyDb();
    expect(parseDb(JSON.stringify(db))).toEqual(db);
  });
});
