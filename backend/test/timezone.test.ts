import { afterEach, describe, expect, it } from "vitest";

import {
  applyTimeZone,
  ConfigError,
  loadConfig,
  timeZoneOf,
} from "../src/config";
import { dayStart, firstDay } from "../src/domains/funnel/report";

// Часовой пояс у команд владельца (auto-tasks-metrics-1 M11): день в отчёте
// и граница --since — по Бишкеку, даже если ноутбук в другом поясе. Без базы.
const original = process.env.TZ;
afterEach(() => {
  process.env.TZ = original;
});

// 28.11 02:00 по Бишкеку = 27.11 20:00 UTC = 27.11 12:00 в Лос-Анджелесе.
const NIGHT_IN_BISHKEK = Date.UTC(2026, 10, 27, 20, 0);

describe("часовой пояс команд (M11)", () => {
  it("ноутбук в Лос-Анджелесе: без пояса — вчерашний день, с applyTimeZone — день и полночь Бишкека", () => {
    process.env.TZ = "America/Los_Angeles";
    expect(firstDay(1, NIGHT_IN_BISHKEK)).toBe("2026-11-27");

    // Как в funnel-cli: переменной TZ нет — пояс по умолчанию.
    applyTimeZone(timeZoneOf({}));
    expect(firstDay(1, NIGHT_IN_BISHKEK)).toBe("2026-11-28");
    // Граница readProfilesByVia и --since — полночь по Бишкеку (UTC+6).
    expect(dayStart(firstDay(1, NIGHT_IN_BISHKEK)).toISOString()).toBe(
      "2026-11-27T18:00:00.000Z",
    );
    expect(dayStart("2026-12-11").toISOString()).toBe(
      "2026-12-10T18:00:00.000Z",
    );
    expect(firstDay(7, NIGHT_IN_BISHKEK, "2026-11-26")).toBe("2026-11-26");
  });

  it("пояс процесса UTC (сервер без TZ): в 02:00 по Бишкеку — сегодняшний день Бишкека", () => {
    process.env.TZ = "UTC";
    expect(firstDay(1, NIGHT_IN_BISHKEK)).toBe("2026-11-27");
    applyTimeZone(loadConfig({}).TZ);
    expect(firstDay(1, NIGHT_IN_BISHKEK)).toBe("2026-11-28");
  });

  it("пустой TZ — по умолчанию Бишкек; неизвестный пояс — понятная ошибка, а не молчаливый UTC", () => {
    expect(timeZoneOf({ TZ: "" })).toBe("Asia/Bishkek");
    expect(timeZoneOf({})).toBe("Asia/Bishkek");
    expect(() => timeZoneOf({ TZ: "Mars/Olympus" })).toThrow(ConfigError);
    expect(() => loadConfig({ TZ: "Mars/Olympus" })).toThrow(
      /Неизвестный часовой пояс/,
    );
  });
});
