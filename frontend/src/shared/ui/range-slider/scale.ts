// Логарифмическая шкала бюджета 0 – 100 000 сом (DESIGN.md §7 RangeSlider):
// на линейной шкале диапазон до 3 000 занял бы 3% трека. Здесь 3 000 —
// примерно середина, 1 000 — треть.
export const BUDGET_MAX = 100_000;
const SCALE = Math.log10(1 + BUDGET_MAX / 100);

export const toPosition = (value: number): number =>
  Math.min(1, Math.max(0, Math.log10(1 + value / 100) / SCALE));

export const fromPosition = (position: number): number =>
  100 * (10 ** (Math.min(1, Math.max(0, position)) * SCALE) - 1);

// «Магниты»: рядом с ними ползунок прилипает к круглому числу.
export const MAGNETS = [1000, 3000, 5000, 10_000, 20_000, 50_000] as const;
const MAGNET_RADIUS = 0.025;

// Шаги для клавиатуры: стрелки переходят к соседнему «удобному» значению.
export const STOPS = [
  0,
  500,
  1000,
  1500,
  2000,
  3000,
  4000,
  5000,
  7000,
  10_000,
  15_000,
  20_000,
  30_000,
  50_000,
  70_000,
  BUDGET_MAX,
] as const;

// Округление по месту на шкале: мелкие суммы — до 50, крупные — до 1 000.
const roundValue = (value: number): number => {
  const step =
    value < 1000 ? 50 : value < 10_000 ? 100 : value < 50_000 ? 500 : 1000;
  return Math.round(value / step) * step;
};

export const snapPosition = (position: number): number => {
  for (const magnet of MAGNETS) {
    if (Math.abs(toPosition(magnet) - position) < MAGNET_RADIUS) return magnet;
  }
  if (position >= 1 - MAGNET_RADIUS / 2) return BUDGET_MAX;
  return Math.min(BUDGET_MAX, roundValue(fromPosition(position)));
};

export const nextStop = (value: number, direction: -1 | 1): number => {
  if (direction > 0) return STOPS.find((stop) => stop > value) ?? BUDGET_MAX;
  return [...STOPS].reverse().find((stop) => stop < value) ?? 0;
};
