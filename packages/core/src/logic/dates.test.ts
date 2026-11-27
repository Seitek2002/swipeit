import { describe, expect, it } from "vitest";

import type { ImportantDate } from "../api/users/types";
import {
  activeReminder,
  daysUntil,
  nextAutoNumber,
  nextOccurrence,
  reminderJumpTarget,
} from "./dates";

// Даты и напоминания (TECH_SPEC §6): чистые функции dates.ts.
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).getTime();

const date = (overrides: Partial<ImportantDate>): ImportantDate => ({
  id: "d_1",
  ownerId: "u_1",
  date: "06-02",
  autoNumber: 1,
  createdAt: "2026-11-01T00:00:00.000Z",
  ...overrides,
});

describe("nextOccurrence", () => {
  it("сегодня — это сегодня, прошедшая в этом году — в следующем", () => {
    expect(nextOccurrence("11-27", at(2026, 11, 27, 23))).toBe("2026-11-27");
    expect(nextOccurrence("03-14", at(2026, 11, 27))).toBe("2027-03-14");
    expect(nextOccurrence("12-31", at(2026, 11, 27))).toBe("2026-12-31");
  });

  it("через Новый год: 01-10 при «сейчас» 20 декабря — следующий год", () => {
    expect(nextOccurrence("01-10", at(2026, 12, 20))).toBe("2027-01-10");
    expect(daysUntil("2027-01-10", at(2026, 12, 20))).toBe(21);
  });

  it("29 февраля в невисокосный год — 28 февраля, в високосный — 29-е", () => {
    expect(nextOccurrence("02-29", at(2027, 1, 15))).toBe("2027-02-28");
    expect(nextOccurrence("02-29", at(2027, 3, 1))).toBe("2028-02-29");
    // 28 февраля невисокосного года уже наступило — день рождения сегодня.
    expect(nextOccurrence("02-29", at(2027, 2, 28))).toBe("2027-02-28");
  });
});

describe("nextAutoNumber — «Значимая дата N»", () => {
  it("наименьший свободный номер", () => {
    expect(nextAutoNumber([])).toBe(1);
    expect(nextAutoNumber([date({ autoNumber: 1 })])).toBe(2);
    expect(
      nextAutoNumber([date({ autoNumber: 1 }), date({ autoNumber: 3 })]),
    ).toBe(2);
  });

  it("даты со своим названием или готовым поводом номер не занимают", () => {
    expect(nextAutoNumber([date({ autoNumber: 1, label: "Диплом" })])).toBe(1);
    expect(nextAutoNumber([date({ autoNumber: 1, preset: "wedding" })])).toBe(
      1,
    );
    expect(
      nextAutoNumber([
        date({ autoNumber: 1, preset: "anniversary" }),
        date({ autoNumber: 1, id: "d_2" }),
      ]),
    ).toBe(2);
  });
});

describe("activeReminder", () => {
  const user = { birthday: "03-14" };

  it("окно 0–30 дней: за 30 дней — есть, за 31 — нет, в сам день — 0", () => {
    expect(activeReminder(user, [], at(2027, 2, 12))).toMatchObject({
      id: "birthday:2027",
      kind: "birthday",
      label: "твой день рождения",
      date: "2027-03-14",
      daysLeft: 30,
    });
    expect(activeReminder(user, [], at(2027, 2, 11))).toBeNull();
    expect(activeReminder(user, [], at(2027, 3, 14, 20))?.daysLeft).toBe(0);
    expect(activeReminder(user, [], at(2027, 3, 15))).toBeNull();
  });

  it("из нескольких — ближайшее; у значимой даты — её название", () => {
    const dates = [
      date({ id: "d_far", date: "04-01", preset: "housewarming" }),
      date({ id: "d_near", date: "03-01", autoNumber: 2 }),
    ];
    expect(activeReminder(user, dates, at(2027, 2, 20))).toMatchObject({
      id: "d_near:2027",
      kind: "important",
      dateId: "d_near",
      label: "Значимая дата 2",
      daysLeft: 9,
    });
    expect(
      activeReminder({}, [dates[0] as ImportantDate], at(2027, 3, 10)),
    ).toMatchObject({ label: "Новоселье", daysLeft: 22 });
  });

  it("через Новый год: id — год наступления", () => {
    const dates = [date({ id: "d_jan", date: "01-10" })];
    expect(activeReminder({}, dates, at(2026, 12, 20))).toMatchObject({
      id: "d_jan:2027",
      date: "2027-01-10",
      daysLeft: 21,
    });
  });

  it("«Скрыть» действует только на этот год", () => {
    const dismissed = { ...user, dismissedReminders: ["birthday:2027"] };
    expect(activeReminder(dismissed, [], at(2027, 3, 1))).toBeNull();
    // Через год то же окно — снова напоминание, уже с другим id.
    expect(activeReminder(dismissed, [], at(2028, 3, 1))).toMatchObject({
      id: "birthday:2028",
      daysLeft: 13,
    });
  });

  it("скрыто ближайшее — показываем следующее в окне", () => {
    const dates = [date({ id: "d_1", date: "03-20" })];
    const dismissed = { ...user, dismissedReminders: ["birthday:2027"] };
    expect(activeReminder(dismissed, dates, at(2027, 3, 1))).toMatchObject({
      id: "d_1:2027",
    });
  });
});

describe("reminderJumpTarget — «Перемотать к напоминанию»", () => {
  it("за 30 дней до ближайшего наступления, в полдень", () => {
    const target = reminderJumpTarget(
      { birthday: "03-14" },
      [date({ date: "06-02" })],
      at(2026, 11, 27),
    );
    expect(target?.id).toBe("birthday:2027");
    expect(target?.at).toBe(at(2027, 2, 12));
    expect(
      activeReminder({ birthday: "03-14" }, [], target?.at ?? 0)?.daysLeft,
    ).toBe(30);
  });

  it("скрытое наступление пропускается: другая дата или та же через год", () => {
    const dates = [date({ id: "d_1", date: "06-02" })];
    const now = at(2027, 2, 12);
    expect(
      reminderJumpTarget(
        { birthday: "03-14", dismissedReminders: ["birthday:2027"] },
        dates,
        now,
      )?.id,
    ).toBe("d_1:2027");
    expect(
      reminderJumpTarget(
        {
          birthday: "03-14",
          dismissedReminders: ["birthday:2027", "d_1:2027"],
        },
        dates,
        now,
      )?.id,
    ).toBe("birthday:2028");
    expect(reminderJumpTarget({}, [], now)).toBeNull();
  });

  it("часы только вперёд: окно даты уже началось — следующая", () => {
    // До дня рождения 10 дней: его окно уже идёт, назад не перематываем.
    const now = at(2027, 3, 4);
    const target = reminderJumpTarget(
      { birthday: "03-14" },
      [date({ id: "d_1", date: "06-02" })],
      now,
    );
    expect(target?.id).toBe("d_1:2027");
    expect(target?.at).toBeGreaterThanOrEqual(now);
  });
});
