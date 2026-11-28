import { describe, expect, it } from "vitest";

import {
  budgetError,
  newSantaForm,
  parseBudget,
  santaFormOf,
  santaFormValid,
  santaPatch,
  toLocalInput,
} from "./form";

const NOW = new Date(2026, 10, 28, 12).getTime();
const HOUR = 3600_000;

const GAME = {
  title: "Офис",
  budget: 2000,
  exchangeDate: "2026-12-28",
};

describe("бюджет", () => {
  it("цифры и пробелы — число, иначе NaN и ошибка", () => {
    expect(parseBudget("2 000")).toBe(2000);
    expect(parseBudget("1500.50")).toBeNaN();
    expect(parseBudget("1,5")).toBeNaN();
    expect(budgetError("")).toBeUndefined();
    expect(budgetError("0")).toBe("Целое число в сомах, например 2 000");
    expect(budgetError("3000")).toBeUndefined();
  });
});

describe("santaFormValid", () => {
  it("нужны название, бюджет, дата обмена и дата жеребьёвки «По дате»", () => {
    const form = { ...newSantaForm(NOW), title: "Офис" };
    expect(santaFormValid(form)).toBe(true);
    expect(santaFormValid({ ...form, title: "  " })).toBe(false);
    expect(santaFormValid({ ...form, budget: "abc" })).toBe(false);
    expect(santaFormValid({ ...form, exchangeDate: "" })).toBe(false);
    expect(santaFormValid({ ...form, drawMode: "date", drawAt: "" })).toBe(
      false,
    );
  });
});

describe("santaPatch — только изменённые поля (R03)", () => {
  it("ничего не меняли — пустая правка, и для игры по дате тоже", () => {
    expect(santaPatch(GAME, santaFormOf(GAME, NOW))).toEqual({});
    const dated = { ...GAME, drawAt: new Date(NOW + HOUR).toISOString() };
    expect(santaPatch(dated, santaFormOf(dated, NOW))).toEqual({});
  });

  it("бюджет и название — без дат: старая дата жеребьёвки могла пройти", () => {
    const past = { ...GAME, drawAt: new Date(NOW - HOUR).toISOString() };
    const form = { ...santaFormOf(past, NOW), budget: "3 000", title: " Дом " };
    expect(santaPatch(past, form)).toEqual({ budget: 3000, title: "Дом" });
  });

  it("жеребьёвка: включили, перенесли, выключили", () => {
    const form = santaFormOf(GAME, NOW);
    const drawAt = toLocalInput(NOW + 2 * HOUR);
    expect(santaPatch(GAME, { ...form, drawMode: "date", drawAt })).toEqual({
      drawMode: "date",
      drawAt: new Date(NOW + 2 * HOUR).toISOString(),
    });
    const dated = { ...GAME, drawAt: new Date(NOW + HOUR).toISOString() };
    expect(santaPatch(dated, { ...santaFormOf(dated, NOW), drawAt })).toEqual({
      drawMode: "date",
      drawAt: new Date(NOW + 2 * HOUR).toISOString(),
    });
    expect(
      santaPatch(dated, { ...santaFormOf(dated, NOW), drawMode: "manual" }),
    ).toEqual({ drawMode: "manual" });
  });

  it("дата обмена", () => {
    const form = { ...santaFormOf(GAME, NOW), exchangeDate: "2026-12-27" };
    expect(santaPatch(GAME, form)).toEqual({ exchangeDate: "2026-12-27" });
  });
});
