import { describe, expect, it } from "vitest";

import { activeReminder } from "./dates";

// «До Нового года» (auto-tasks P06): с 1 по 31 декабря, если есть желания и
// вишлист к этому Новому году ещё не отправляли.
const at = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).getTime();
const user = { dismissedReminders: [] as string[] };
const withWishes = { wishCount: 3 };

describe("напоминание о Новом годе", () => {
  it("30 ноября — нет, 1 декабря — «через 30 дней»", () => {
    expect(activeReminder(user, [], at(2026, 11, 30), withWishes)).toBeNull();
    expect(activeReminder(user, [], at(2026, 12, 1), withWishes)).toEqual({
      id: "new_year:2026",
      kind: "new_year",
      label: "Новый год",
      date: "2026-12-31",
      daysLeft: 30,
    });
  });

  it("без желаний и без контекста — нет", () => {
    expect(
      activeReminder(user, [], at(2026, 12, 10), { wishCount: 0 }),
    ).toBeNull();
    expect(activeReminder(user, [], at(2026, 12, 10))).toBeNull();
  });

  it("вишлист уже отправлен к этому Новому году — нет; к прошлому — есть", () => {
    expect(
      activeReminder(user, [], at(2026, 12, 10), {
        wishCount: 3,
        occasion: { kind: "new_year", date: "2026-12-31" },
      }),
    ).toBeNull();
    expect(
      activeReminder(user, [], at(2026, 12, 10), {
        wishCount: 3,
        occasion: { kind: "new_year", date: "2025-12-31" },
      })?.kind,
    ).toBe("new_year");
  });

  it("1 января — нет; «Скрыть» — до следующего декабря", () => {
    expect(activeReminder(user, [], at(2027, 1, 1), withWishes)).toBeNull();
    const hidden = { dismissedReminders: ["new_year:2026"] };
    expect(activeReminder(hidden, [], at(2026, 12, 10), withWishes)).toBeNull();
    expect(activeReminder(hidden, [], at(2027, 12, 10), withWishes)?.id).toBe(
      "new_year:2027",
    );
  });

  it("свой день рождения ближе Нового года — показываем его", () => {
    expect(
      activeReminder(
        { ...user, birthday: "12-05" },
        [],
        at(2026, 12, 1),
        withWishes,
      )?.kind,
    ).toBe("birthday");
  });
});
