import { toDateKey } from "@swipeit/core/format";
import { count, gte } from "drizzle-orm";

import type { Database } from "../../db/client";
import { funnelDaily, users } from "../../db/schema";
import { FUNNEL_STEPS, type FunnelStep } from "./steps";

// Конверсии воронки (P09): «из тех, кто дошёл до шага A, до шага B дошли …».
// Считаются по суммам за период — по дням людей слишком мало.
export const FUNNEL_CONVERSIONS: [from: FunnelStep, to: FunnelStep][] = [
  ["profile_created", "first_swipe"],
  ["first_swipe", "share_unlocked"],
  // Владелец: отправил → ссылка дошла → забронировали (Q01).
  ["share_unlocked", "wishlist_shared"],
  ["wishlist_shared", "share_reached"],
  ["share_reached", "reservation_received"],
  // Гость: открыл → забронировал; открыл → свайпнул → отправил свой (петля).
  ["guest_opened", "reservation_created"],
  ["guest_opened", "guest_first_swipe"],
  ["guest_first_swipe", "guest_shared"],
  ["plan_created", "plan_decided"],
  ["santa_drawn", "ward_empty"],
];

// Откуда пришли профили за период (Q01): users.created_via. Только
// счётчики, без id.
export const readProfilesByVia = async (
  db: Database,
  days: number,
  now: number,
): Promise<Array<{ count: number; via: string }>> => {
  const since = new Date(`${toDateKey(now - (days - 1) * DAY_MS)}T00:00:00`);
  const rows = await db
    .select({ via: users.createdVia, count: count() })
    .from(users)
    .where(gte(users.createdAt, since))
    .groupBy(users.createdVia);
  return rows.map((row) => ({ via: row.via ?? "—", count: row.count }));
};

export type FunnelRow = { count: number; day: string; step: string };

const DAY_MS = 24 * 60 * 60 * 1000;

// Последние `days` дней, считая сегодняшний.
export const readFunnel = async (
  db: Database,
  days: number,
  now: number,
): Promise<FunnelRow[]> => {
  const since = toDateKey(now - (days - 1) * DAY_MS);
  return db
    .select({
      day: funnelDaily.day,
      step: funnelDaily.step,
      count: funnelDaily.count,
    })
    .from(funnelDaily)
    .where(gte(funnelDaily.day, since));
};

const percent = (part: number, whole: number) =>
  whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`;

// Таблица «день × шаг» и конверсии — текстом для терминала.
export const formatFunnel = (
  rows: FunnelRow[],
  days: number,
  byVia: ReadonlyArray<{ count: number; via: string }> = [],
): string => {
  const dayKeys = [...new Set(rows.map((row) => row.day))].sort();
  const countOf = (day: string, step: string) =>
    rows.find((row) => row.day === day && row.step === step)?.count ?? 0;
  const total = (step: string) =>
    rows
      .filter((row) => row.step === step)
      .reduce((sum, row) => sum + row.count, 0);

  const stepWidth = Math.max(...FUNNEL_STEPS.map((step) => step.length));
  const header = [
    "шаг".padEnd(stepWidth),
    ...dayKeys.map((d) => d.slice(5)),
    "всего",
  ];
  const lines = [
    `Воронка за ${days} дн. (первое наступление шага у человека)`,
    "",
    header.join("  "),
    ...FUNNEL_STEPS.map((step) =>
      [
        step.padEnd(stepWidth),
        ...dayKeys.map((day) => String(countOf(day, step)).padStart(5)),
        String(total(step)).padStart(5),
      ].join("  "),
    ),
    "",
    ...(byVia.length > 0
      ? [
          "",
          "Откуда профили (created_via; «—» — не указано):",
          ...byVia.map(({ via, count: n }) => `  ${via}: ${n}`),
        ]
      : []),
    "",
    "Конверсии за период:",
    ...FUNNEL_CONVERSIONS.map(
      ([from, to]) =>
        `  ${from} → ${to}: ${percent(total(to), total(from))} (${total(to)} из ${total(from)})`,
    ),
  ];
  return lines.join("\n");
};
