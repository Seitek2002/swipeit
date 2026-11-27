import { describe, expect, it } from "vitest";

import {
  LIVE_DURATION_MINUTES,
  buildIcs,
  foldLine,
  liveStart,
  nextSaturdayNoon,
  planEventStart,
} from "./model";

describe("calendar-export", () => {
  it("длинные строки сворачиваются по 75 октетов, не разрывая букв", () => {
    const line = `DESCRIPTION:${"Айгерим, Азамат, Нурай, ".repeat(8)}`;
    const lines = foldLine(line).split("\r\n");
    const encoder = new TextEncoder();
    expect(lines.length).toBeGreaterThan(1);
    for (const part of lines) {
      expect(encoder.encode(part).length).toBeLessThanOrEqual(75);
    }
    expect(lines.slice(1).every((part) => part.startsWith(" "))).toBe(true);
    const joined = lines
      .map((part, index) => (index === 0 ? part : part.slice(1)))
      .join("");
    expect(joined).toBe(line);
  });

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

describe("«Прямо сейчас» в календаре (UX-аудит H3)", () => {
  // Пятница, 27 ноября 2026, вечер — местное время.
  const at = (h: number, m: number, s = 0) =>
    new Date(2026, 10, 27, h, m, s).getTime();
  const hm = (date: Date) => [
    date.getDate(),
    date.getHours(),
    date.getMinutes(),
  ];

  it("сегодня, через час после решения, вверх до :00 или :30", () => {
    expect(hm(liveStart(at(19, 10)))).toEqual([27, 20, 30]);
    expect(hm(liveStart(at(19, 0)))).toEqual([27, 20, 0]);
    expect(hm(liveStart(at(19, 30, 1)))).toEqual([27, 21, 0]);
    expect(hm(liveStart(at(19, 45)))).toEqual([27, 21, 0]);
  });

  it("план «Прямо сейчас» — не суббота: .ics сегодня, на 2 часа", () => {
    const start = planEventStart({
      decidedAt: at(19, 10),
      mode: "live",
      now: at(19, 12),
    });
    expect(hm(start)).toEqual([27, 20, 30]);
    const ics = buildIcs(
      {
        uid: "pl_1",
        title: "Бранч",
        description: "",
        start,
        durationMinutes: LIVE_DURATION_MINUTES,
      },
      at(19, 12),
    );
    const utc = (date: Date) =>
      date
        .toISOString()
        .replace(/[-:]/g, "")
        .replace(/\.\d{3}/, "");
    expect(ics).toContain(`DTSTART:${utc(start)}`);
    expect(ics).toContain(
      `DTEND:${utc(new Date(start.getTime() + 2 * 60 * 60_000))}`,
    );
  });

  it("«До даты» без времени — ближайшая суббота 12:00; время из решения — как есть", () => {
    const deadline = planEventStart({
      decidedAt: at(19, 10),
      mode: "deadline",
      now: at(19, 12),
    });
    expect([deadline.getDay(), deadline.getHours()]).toEqual([6, 12]);
    const fixed = "2026-12-05T15:00:00.000Z";
    expect(
      planEventStart({
        decidedAt: at(19, 10),
        mode: "live",
        now: at(19, 12),
        scheduledFor: fixed,
      }).toISOString(),
    ).toBe(fixed);
  });
});
