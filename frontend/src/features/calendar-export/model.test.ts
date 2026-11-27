import { describe, expect, it } from "vitest";

import { buildIcs, nextSaturdayNoon } from "./model";

describe("calendar-export", () => {
  it("ближайшая суббота 12:00", () => {
    // Пятница 27.11.2026 10:00 → суббота 28.11 12:00.
    const friday = new Date(2026, 10, 27, 10).getTime();
    const saturday = nextSaturdayNoon(friday);
    expect([
      saturday.getDay(),
      saturday.getDate(),
      saturday.getHours(),
    ]).toEqual([6, 28, 12]);
    // Суббота 13:00 → через неделю.
    const late = nextSaturdayNoon(new Date(2026, 10, 28, 13).getTime());
    expect(late.getDate()).toBe(5);
  });

  it("VEVENT с экранированием и UTC-временем", () => {
    const ics = buildIcs(
      {
        uid: "pl_1",
        title: "Кино, в Bishkek Park; вечером",
        description: "Айгерим, Азамат\nНурай",
        start: new Date(Date.UTC(2026, 10, 28, 6)),
        durationMinutes: 120,
      },
      Date.UTC(2026, 10, 27),
    );
    expect(ics).toContain("BEGIN:VEVENT");
    expect(ics).toContain("DTSTART:20261128T060000Z");
    expect(ics).toContain("DTEND:20261128T080000Z");
    expect(ics).toContain("SUMMARY:Кино\\, в Bishkek Park\\; вечером");
    expect(ics).toContain("DESCRIPTION:Айгерим\\, Азамат\\nНурай");
    expect(ics.split("\r\n").length).toBeGreaterThan(10);
  });
});
