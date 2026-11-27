import { describe, expect, it } from "vitest";

import type { MyReservation } from "../api/wishlist/types";
import { visibleMyReservations } from "./my-reservations";

// 28.11.2026, полдень по Бишкеку.
const NOW = Date.UTC(2026, 10, 28, 6);

const reservation = (
  id: string,
  patch: Partial<MyReservation> = {},
): MyReservation => ({
  id,
  itemKey: `p_${id}`,
  closed: false,
  at: "2026-11-20T10:00:00.000Z",
  owner: { id: "u_1", name: "Айгерим", avatarColor: "mint" },
  item: { productId: `p_${id}` },
  ...patch,
});

describe("«Я дарю» — порядок и что прячем (P02)", () => {
  it("открытые по ближайшей дате, без даты — после, закрытые — внизу", () => {
    const list = [
      reservation("closed", {
        closed: true,
        occasion: { kind: "birthday", date: "2026-12-01" },
      }),
      reservation("nodate"),
      reservation("late", {
        occasion: { kind: "march_8", date: "2027-03-08" },
      }),
      reservation("soon", {
        occasion: { kind: "new_year", date: "2026-12-31" },
      }),
    ];
    expect(visibleMyReservations(list, NOW).map((r) => r.id)).toEqual([
      "soon",
      "late",
      "nodate",
      "closed",
    ]);
  });

  it("закрытая уходит через 30 дней после даты повода, без даты — после закрытия", () => {
    const list = [
      reservation("old", {
        closed: true,
        occasion: { kind: "birthday", date: "2026-10-28" },
      }),
      reservation("recent", {
        closed: true,
        occasion: { kind: "birthday", date: "2026-10-30" },
      }),
      reservation("closedLongAgo", {
        closed: true,
        closedAt: "2026-10-01T10:00:00.000Z",
      }),
      reservation("closedRecently", {
        closed: true,
        closedAt: "2026-11-20T10:00:00.000Z",
      }),
      // Открытая с прошедшей датой не прячется: подарок ещё не отмечен.
      reservation("openPast", {
        occasion: { kind: "birthday", date: "2026-09-01" },
      }),
    ];
    expect(
      visibleMyReservations(list, NOW)
        .map((r) => r.id)
        .sort(),
    ).toEqual(["closedRecently", "openPast", "recent"]);
  });
});
