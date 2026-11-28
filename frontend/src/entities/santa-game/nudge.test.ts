import { describe, expect, it } from "vitest";

import type { SantaSummary } from "@/shared/api";

import { santaWishlistNudge } from "./nudge";

const game = (id: string, budget: number, exchangeDate: string) =>
  ({
    game: {
      id,
      title: id,
      budget,
      exchangeDate,
      participantIds: ["me", "a", "b"],
    },
  }) as unknown as SantaSummary;

describe("santaWishlistNudge (R06)", () => {
  it("нет игр — null", () => {
    expect(santaWishlistNudge([], "me", [])).toBeNull();
  });

  it("два желания в бюджете — подсказка; три — нет", () => {
    const office = game("Офис", 2000, "2026-12-25");
    expect(santaWishlistNudge([office], "me", [500, 1500])).toEqual({
      gameId: "Офис",
      title: "Офис",
      budget: 2000,
    });
    expect(santaWishlistNudge([office], "me", [500, 1500, 2000])).toBeNull();
  });

  it("дороже бюджета и без цены не считаются", () => {
    const office = game("Офис", 2000, "2026-12-25");
    expect(
      santaWishlistNudge([office], "me", [500, 1500, 2001, null]),
    ).not.toBeNull();
  });

  it("из двух игр — с ранней датой обмена; чужая игра не в счёт", () => {
    const later = game("Семья", 5000, "2026-12-31");
    const sooner = game("Офис", 2000, "2026-12-20");
    expect(santaWishlistNudge([later, sooner], "me", [])?.gameId).toBe("Офис");
    expect(santaWishlistNudge([later], "stranger", [])).toBeNull();
  });
});
