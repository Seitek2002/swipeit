// Чистая логика DayMonthPicker (DESIGN.md §7): значение — "MM-DD", год не
// спрашиваем, поэтому в феврале всегда 29 дней.

export const MONTHS_SHORT = [
  "янв",
  "фев",
  "мар",
  "апр",
  "май",
  "июн",
  "июл",
  "авг",
  "сен",
  "окт",
  "ноя",
  "дек",
] as const;

// Полные названия — для скринридера: «мар» он прочитал бы по буквам.
export const MONTHS_FULL = [
  "Январь",
  "Февраль",
  "Март",
  "Апрель",
  "Май",
  "Июнь",
  "Июль",
  "Август",
  "Сентябрь",
  "Октябрь",
  "Ноябрь",
  "Декабрь",
] as const;

const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

// month — 1..12.
export const daysInMonth = (month: number): number =>
  DAYS_IN_MONTH[month - 1] ?? 31;

const pad = (value: number) => String(value).padStart(2, "0");

export const toMonthDay = (month: number, day: number): string =>
  `${pad(month)}-${pad(day)}`;

// "MM-DD" → { month, day }; кривое значение — null (пикер покажет «Выбери
// день», а не упадёт).
export const parseMonthDay = (
  value: null | string | undefined,
): { day: number; month: number } | null => {
  const match = /^(\d{2})-(\d{2})$/.exec(value ?? "");
  if (!match) return null;
  const month = Number(match[1]);
  const day = Number(match[2]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(month))
    return null;
  return { month, day };
};

// Сменили месяц при выбранном дне: день остаётся, но не больше, чем дней в
// новом месяце (31 января → февраль = 29 февраля), как в quick-start.html.
export const withMonth = (value: string, month: number): string => {
  const parsed = parseMonthDay(value);
  const day = Math.min(parsed?.day ?? 1, daysInMonth(month));
  return toMonthDay(month, day);
};

// Стрелки по сетке из 7 колонок: ←/→ — на день, ↑/↓ — на неделю, Home/End —
// в начало и конец месяца. За края месяца не уходим. null — клавиша не наша.
export const moveDay = (
  day: number,
  key: string,
  maxDay: number,
): null | number => {
  const steps: Record<string, number> = {
    ArrowLeft: -1,
    ArrowRight: 1,
    ArrowUp: -7,
    ArrowDown: 7,
  };
  if (key === "Home") return 1;
  if (key === "End") return maxDay;
  const step = steps[key];
  if (step === undefined) return null;
  return Math.max(1, Math.min(maxDay, day + step));
};
