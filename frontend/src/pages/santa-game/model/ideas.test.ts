import { describe, expect, it } from "vitest";

import type { Product } from "@/entities/product";

import { needsSantaIdeas, santaIdeas } from "./ideas";

const product = (id: string, category: string, priceMin: number) =>
  ({ id, category, priceMin, priceMax: priceMin }) as unknown as Product;

describe("идеи для Санты (P05)", () => {
  it("до 6 штук, все не дороже бюджета, не больше двух из категории", () => {
    const feed = [
      product("a1", "tech", 900),
      product("a2", "tech", 1500),
      product("a3", "tech", 1200),
      product("b1", "beauty", 2500),
      product("b2", "beauty", 700),
      product("c1", "home", 1999),
      product("d1", "books", 600),
      product("e1", "games", 1800),
      product("f1", "kids", 500),
    ];
    const ideas = santaIdeas(feed, 2000, new Set());
    expect(ideas.map((p) => p.id)).toEqual([
      "a1",
      "a2",
      "b2",
      "c1",
      "d1",
      "e1",
    ]);
    expect(ideas.every((p) => p.priceMin <= 2000)).toBe(true);
  });

  it("то, что уже в вишлисте подопечного, не повторяем", () => {
    const ideas = santaIdeas(
      [product("a1", "tech", 900), product("a2", "home", 900)],
      2000,
      new Set(["a1"]),
    );
    expect(ideas.map((p) => p.id)).toEqual(["a2"]);
  });

  it("идеи нужны, пока в бюджете меньше трёх желаний", () => {
    expect(needsSantaIdeas(0)).toBe(true);
    expect(needsSantaIdeas(2)).toBe(true);
    expect(needsSantaIdeas(3)).toBe(false);
  });
});
