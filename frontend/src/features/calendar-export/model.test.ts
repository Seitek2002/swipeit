import { describe, expect, it } from "vitest";

import {
  LIVE_DURATION_MINUTES,
  buildIcs,
  dayOf,
  foldLine,
  giftReminderDay,
  liveStart,
  nextSaturdayNoon,
  planEventStart,
  planWhen,
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

describe("когда на «Решено» (auto-tasks V01)", () => {
  const decidedAt = new Date(2026, 10, 28, 4, 30).getTime();

  it("«До даты» без выбранного времени — не выбрано, ничего не выдумываем", () => {
    expect(planWhen({ decidedAt, mode: "deadline" })).toEqual({
      kind: "unscheduled",
    });
  });

  it("время выбрали — оно; «Прямо сейчас» — сегодня", () => {
    expect(
      planWhen({
        decidedAt,
        mode: "deadline",
        scheduledFor: "2026-11-29T15:00:00.000Z",
      }),
    ).toEqual({
      kind: "scheduled",
      start: new Date("2026-11-29T15:00:00.000Z"),
    });
    expect(planWhen({ decidedAt, mode: "live" }).kind).toBe("today");
  });

  it(".ics на весь день — только дата, без времени", () => {
    const ics = buildIcs(
      {
        uid: "x",
        title: "Концерт",
        start: new Date(2026, 11, 5, 12),
        durationMinutes: 120,
        description: "Пятница",
        allDay: true,
      },
      decidedAt,
    );
    expect(ics).toContain("DTSTART;VALUE=DATE:20261205");
    expect(ics).toContain("DTEND;VALUE=DATE:20261206");
    expect(ics).not.toMatch(/DTSTART:\d/);
  });
});

describe("«Напомнить в календаре» после брони (P07)", () => {
  const at = (y: number, m: number, d: number) =>
    new Date(y, m - 1, d, 10).getTime();

  it("за 3 дня до повода", () => {
    expect(giftReminderDay("2026-12-31", at(2026, 11, 28))).toEqual(
      new Date(2026, 11, 28, 12),
    );
  });

  it("через Новый год: повод 2 января — напоминание 30 декабря", () => {
    expect(giftReminderDay("2027-01-02", at(2026, 12, 1))).toEqual(
      new Date(2026, 11, 30, 12),
    );
  });

  it("до повода меньше 3 дней — сегодня", () => {
    expect(giftReminderDay("2026-11-29", at(2026, 11, 28))).toEqual(
      new Date(2026, 10, 28, 12),
    );
  });

  it("длинное название в .ics складывается по 75 октетов", () => {
    const ics = buildIcs(
      {
        uid: "r",
        title: `Купить подарок для Айгерим: ${"Очень длинное название ".repeat(5)}`,
        start: dayOf("2026-12-28"),
        durationMinutes: 60,
        description: "https://kivano.kg/product/view/1",
        allDay: true,
      },
      at(2026, 11, 28),
    );
    for (const line of ics.split("\r\n")) {
      expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    }
    expect(ics).toContain("DTSTART;VALUE=DATE:20261228");
  });
});
