import { describe, expect, it } from "vitest";

import { BIRTHDAY_REMINDER_LABEL } from "@/shared/config";

import { reminderText, reminderWhen } from "./model";

describe("reminderWhen", () => {
  it("за день и в сам день — словами", () => {
    expect(reminderWhen(0)).toBe("Сегодня");
    expect(reminderWhen(1)).toBe("Завтра");
  });

  it("иначе — «Через N дней» с согласованием", () => {
    expect(reminderWhen(2)).toBe("Через 2 дня");
    expect(reminderWhen(5)).toBe("Через 5 дней");
    expect(reminderWhen(21)).toBe("Через 21 день");
    expect(reminderWhen(26)).toBe("Через 26 дней");
    expect(reminderWhen(30)).toBe("Через 30 дней");
  });
});

describe("reminderText", () => {
  it("день рождения — без даты", () => {
    const birthday = {
      kind: "birthday" as const,
      label: BIRTHDAY_REMINDER_LABEL,
      date: "2027-03-14",
    };
    expect(reminderText({ ...birthday, daysLeft: 26 })).toBe(
      "Через 26 дней твой день рождения",
    );
    expect(reminderText({ ...birthday, daysLeft: 1 })).toBe(
      "Завтра твой день рождения",
    );
    expect(reminderText({ ...birthday, daysLeft: 0 })).toBe(
      "Сегодня твой день рождения",
    );
  });

  it("значимая дата — название и дата", () => {
    const anniversary = {
      kind: "important" as const,
      label: "Годовщина",
      date: "2027-06-02",
    };
    expect(reminderText({ ...anniversary, daysLeft: 26 })).toBe(
      "Через 26 дней — Годовщина, 2\u00a0июня",
    );
    expect(reminderText({ ...anniversary, daysLeft: 1 })).toBe(
      "Завтра — Годовщина, 2\u00a0июня",
    );
    expect(reminderText({ ...anniversary, daysLeft: 0 })).toBe(
      "Сегодня — Годовщина, 2\u00a0июня",
    );
  });
});

describe("текст напоминания о Новом годе (P06)", () => {
  it("«До Нового года 30 дней», в сам день — «Сегодня Новый год»", () => {
    const base = {
      kind: "new_year" as const,
      label: "Новый год",
      date: "2026-12-31",
    };
    expect(reminderText({ ...base, daysLeft: 30 })).toBe(
      "До Нового года 30 дней",
    );
    expect(reminderText({ ...base, daysLeft: 1 })).toBe(
      "До Нового года 1 день",
    );
    expect(reminderText({ ...base, daysLeft: 0 })).toBe("Сегодня Новый год");
  });
});
