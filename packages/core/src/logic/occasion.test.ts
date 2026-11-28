import { describe, expect, it } from "vitest";

import type { ImportantDate } from "../api/users/types";
import { isApiError } from "../errors";
import {
  freshOccasionFrom,
  normalizeOccasionFrom,
  occasionForOthersFrom,
  publicOccasion,
} from "./occasion";
import { countActiveWishItems, shouldUnlockShare } from "./share-threshold";

// 27 ноября 2026, полдень по местному времени.
const NOW = new Date(2026, 10, 27, 12).getTime();

const anniversary: ImportantDate = {
  id: "d_1",
  ownerId: "u_1",
  date: "06-02",
  preset: "anniversary",
  autoNumber: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
} as ImportantDate;

describe("повод без базы (BACKEND.md B02)", () => {
  it("значимая дата — ближайшее наступление и готовый повод; чужой dateId — ошибка", () => {
    expect(
      normalizeOccasionFrom(
        { dates: [anniversary] },
        { kind: "important", dateId: "d_1" },
        NOW,
      ),
    ).toEqual({
      kind: "important",
      dateId: "d_1",
      preset: "anniversary",
      date: "2027-06-02",
    });
    try {
      normalizeOccasionFrom(
        { dates: [] },
        { kind: "important", dateId: "d_x" },
        NOW,
      );
      expect.unreachable();
    } catch (error) {
      expect(isApiError(error) && error.code).toBe("VALIDATION");
    }
  });

  it("день рождения — из профиля, если в запросе нет даты", () => {
    expect(
      normalizeOccasionFrom(
        { birthday: "03-14", dates: [] },
        { kind: "birthday" },
        NOW,
      ),
    ).toEqual({ kind: "birthday", date: "2027-03-14" });
  });

  it("дату удалили — «Просто так»; другим — без dateId и своего названия", () => {
    const occasion = { kind: "important" as const, dateId: "d_1" };
    expect(freshOccasionFrom([], occasion, NOW)).toEqual({
      kind: "just_because",
    });
    expect(occasionForOthersFrom([anniversary], occasion, NOW)).toEqual({
      kind: "important",
      preset: "anniversary",
      date: "2027-06-02",
    });
    expect(
      publicOccasion({ kind: "birthday", date: "2027-03-14", label: "x" }),
    ).toEqual({ kind: "birthday", date: "2027-03-14" });
  });
});

describe("порог отправки без базы", () => {
  it("считаются только желания в «Хочу»; открывается один раз", () => {
    expect(
      countActiveWishItems([
        { status: "active" },
        { status: "given" },
        { status: "active" },
      ]),
    ).toBe(2);
    expect(shouldUnlockShare(4, undefined)).toBe(false);
    expect(shouldUnlockShare(5, undefined)).toBe(true);
    expect(shouldUnlockShare(7, "2026-11-27T12:00:00.000Z")).toBe(false);
  });
});

describe("переименованный готовый повод (P11)", () => {
  it("гость видит «к дате», а не «на новоселье»: preset у переименованной даты не уходит", () => {
    const now = new Date(2026, 10, 28, 12).getTime();
    const renamed = {
      id: "d_1",
      ownerId: "u_1",
      date: "12-05",
      preset: "housewarming" as const,
      label: "Новоселье у моря",
      autoNumber: 1,
      createdAt: "2026-11-01T00:00:00.000Z",
    };
    expect(
      occasionForOthersFrom(
        [renamed],
        { kind: "important", dateId: "d_1" },
        now,
      ),
    ).toEqual({ kind: "important", date: "2026-12-05" });
    const plain = { ...renamed, label: undefined };
    expect(
      occasionForOthersFrom([plain], { kind: "important", dateId: "d_1" }, now),
    ).toEqual({
      kind: "important",
      preset: "housewarming",
      date: "2026-12-05",
    });
  });
});
