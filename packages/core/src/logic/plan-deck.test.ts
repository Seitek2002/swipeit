import { describe, expect, it } from "vitest";

import {
  pickPlanDeck,
  plannedDeckSize,
  QUICK_DECK_SIZE,
  resolveDeckSize,
} from "./plan-deck";
import type { Activity } from "../api/catalog/types";

// Короткая колода «Прямо сейчас» (auto-tasks-ux-4 X05).

// Каталог как настоящий: 50 занятий, «Активных» больше всех.
const COUNTS = {
  active: 13,
  chill: 10,
  nature: 7,
  food: 6,
  culture: 6,
  party: 4,
  selfcare: 4,
} as const;

const activity = (id: string, category: Activity["category"]): Activity => ({
  id,
  title: id,
  description: "",
  category,
  tags: [],
  pricePerPersonMin: 0,
  pricePerPersonMax: 0,
  durationMin: 60,
  durationMax: 120,
  seasons: [],
  groupSize: { min: 2, max: null },
});

const CATALOG: Activity[] = Object.entries(COUNTS).flatMap(
  ([category, count]) =>
    Array.from({ length: count }, (_, index) =>
      activity(`${category}_${index}`, category as Activity["category"]),
    ),
);

const categoriesOf = (deck: readonly Activity[]) =>
  new Set(deck.map((item) => item.category));

describe("resolveDeckSize", () => {
  it("«Прямо сейчас» без значения — короткая колода, «До даты» — все", () => {
    expect(resolveDeckSize("live", undefined)).toBe(QUICK_DECK_SIZE);
    expect(resolveDeckSize("deadline", undefined)).toBeNull();
  });

  it("явное значение — как передали, null — все", () => {
    expect(resolveDeckSize("live", null)).toBeNull();
    expect(resolveDeckSize("deadline", 10)).toBe(10);
  });
});

describe("plannedDeckSize", () => {
  it("каталог урезается до размера, свои — всегда", () => {
    expect(plannedDeckSize(0, 50, 20)).toBe(20);
    expect(plannedDeckSize(2, 50, 20)).toBe(20);
    expect(plannedDeckSize(0, 12, 20)).toBe(12);
    expect(plannedDeckSize(0, 50, null)).toBe(50);
    expect(plannedDeckSize(25, 50, 20)).toBe(25);
  });
});

describe("pickPlanDeck", () => {
  it("план «Прямо сейчас» без фильтров → 20 занятий из всех категорий", () => {
    const deck = pickPlanDeck([], CATALOG, QUICK_DECK_SIZE, "pl_test");
    expect(deck).toHaveLength(20);
    expect(new Set(deck.map((item) => item.id)).size).toBe(20);
    expect(categoriesOf(deck)).toEqual(new Set(Object.keys(COUNTS)));
    // Поровну: из каждой категории 2–4 занятия, а не 13 «Активных».
    for (const category of Object.keys(COUNTS)) {
      const count = deck.filter((item) => item.category === category).length;
      expect(count).toBeGreaterThanOrEqual(2);
      expect(count).toBeLessThanOrEqual(3);
    }
  });

  it("одинаково для одного плана, по-разному для разных; порядок — как в каталоге", () => {
    const ids = (seed: string) =>
      pickPlanDeck([], CATALOG, 20, seed).map((item) => item.id);
    expect(ids("pl_a")).toEqual(ids("pl_a"));
    expect(ids("pl_a")).not.toEqual(ids("pl_b"));
    const order = CATALOG.map((item) => item.id);
    const picked = ids("pl_a");
    expect(picked).toEqual(order.filter((id) => picked.includes(id)));
  });

  it("свои занятия — всегда и первыми, каталог добирает остальное", () => {
    const custom = [activity("c_1", "chill"), activity("c_2", "food")];
    const deck = pickPlanDeck(custom, CATALOG, 20, "pl_custom");
    expect(deck).toHaveLength(20);
    expect(deck.slice(0, 2)).toEqual(custom);
  });

  it("колода меньше размера или без ограничения — всё как есть", () => {
    const small = CATALOG.slice(0, 12);
    expect(pickPlanDeck([], small, 20, "pl")).toEqual(small);
    expect(pickPlanDeck([], CATALOG, null, "pl")).toEqual(CATALOG);
  });
});
