import { describe, expect, it } from "vitest";

import type { ImportantDateView } from "@/shared/api";

import { removeDate, renamePatch, replaceDate, undoInput } from "./model";

const view = (patch: Partial<ImportantDateView>): ImportantDateView => ({
  id: "d_1",
  ownerId: "u_1",
  date: "06-02",
  autoNumber: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  nextDate: "2027-06-02",
  title: "Значимая дата 1",
  ...patch,
});

describe("renamePatch", () => {
  it("новое название — label", () => {
    expect(renamePatch("  Защита диплома ", view({}))).toEqual({
      label: "Защита диплома",
    });
  });

  it("то же название — ничего не отправляем", () => {
    expect(renamePatch("Значимая дата 1", view({}))).toBeNull();
    expect(
      renamePatch(
        "Годовщина",
        view({ preset: "anniversary", title: "Годовщина" }),
      ),
    ).toBeNull();
  });

  it("пустое поле у своего названия — null: вернётся повод или «Значимая дата N»", () => {
    expect(
      renamePatch("   ", view({ label: "Защита", title: "Защита" })),
    ).toEqual({ label: null });
  });

  it("пустое поле без своего названия — ничего не отправляем", () => {
    expect(renamePatch("", view({}))).toBeNull();
    expect(
      renamePatch("", view({ preset: "wedding", title: "Свадьба" })),
    ).toBeNull();
  });
});

describe("undoInput", () => {
  it("возвращает дату, повод, название и номер", () => {
    expect(
      undoInput(view({ preset: "anniversary", label: "Наша", autoNumber: 3 })),
    ).toEqual({
      date: "06-02",
      preset: "anniversary",
      label: "Наша",
      autoNumber: 3,
    });
  });

  it("без повода и названия — только дата и номер", () => {
    expect(undoInput(view({ autoNumber: 2 }))).toEqual({
      date: "06-02",
      autoNumber: 2,
    });
  });
});

describe("кэш списка", () => {
  const list = [view({ id: "a" }), view({ id: "b", date: "08-11" })];

  it("replaceDate меняет только свою строку", () => {
    const next = view({ id: "b", title: "Новоселье" });
    expect(replaceDate(list, next)).toEqual([list[0], next]);
    expect(replaceDate(undefined, next)).toBeUndefined();
  });

  it("removeDate убирает строку", () => {
    expect(removeDate(list, "a")).toEqual([list[1]]);
    expect(removeDate(undefined, "a")).toBeUndefined();
  });
});
