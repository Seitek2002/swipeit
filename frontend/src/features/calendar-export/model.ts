// .ics для «Добавить в календарь» (TECH_SPEC §8 «Календарь»: VEVENT —
// название, время, описание с участниками). Чистые функции — с тестами.

export type CalendarEvent = {
  description: string;
  durationMinutes: number;
  start: Date;
  title: string;
  uid: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

// Время в UTC: календарь сам переведёт в пояс телефона.
const stamp = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;

// RFC 5545: запятая, точка с запятой, обратный слэш экранируются, перевод
// строки — «\n».
const escapeText = (value: string) =>
  value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");

// RFC 5545: строка не длиннее 75 октетов, продолжение — с новой строки и
// пробела. Режем по символам, а не байтам: кириллица — 2 байта, и разрыв
// посреди буквы сломал бы текст.
const encoder = new TextEncoder();

export const foldLine = (line: string): string => {
  const parts: string[] = [];
  let current = "";
  let size = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // У продолжения первый октет — пробел.
    const limit = parts.length === 0 ? 75 : 74;
    if (size + bytes > limit) {
      parts.push(current);
      current = "";
      size = 0;
    }
    current += char;
    size += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
};

// Ближайшая суббота 12:00 по местному времени (если сегодня суббота и ещё нет
// полудня — сегодня).
export const nextSaturdayNoon = (now: number): Date => {
  const date = new Date(now);
  date.setHours(12, 0, 0, 0);
  const days = (6 - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + days);
  if (date.getTime() <= now) date.setDate(date.getDate() + 7);
  return date;
};

const HALF_HOUR = 30 * 60_000;
// У плана «Прямо сейчас» — 2 часа (TECH_SPEC §8 «Календарь»).
export const LIVE_DURATION_MINUTES = 120;

// «Прямо сейчас»: сегодня, начало через час после решения, вверх до :00 или
// :30 по местному времени (UX-аудит H3: раньше в пятницу вечером «прямо
// сейчас» превращалось в субботу 12:00).
export const liveStart = (decidedAt: number): Date => {
  const date = new Date(decidedAt + 60 * 60_000);
  const sinceHour =
    (date.getMinutes() * 60 + date.getSeconds()) * 1000 +
    date.getMilliseconds();
  const rest = sinceHour % HALF_HOUR;
  return rest === 0 ? date : new Date(date.getTime() + HALF_HOUR - rest);
};

export type PlanTimingInput = {
  decidedAt: number;
  mode: "deadline" | "live";
  now: number;
  scheduledFor?: string;
};

// Когда событие: время из решения, у «Прямо сейчас» — сегодня через час,
// у «До даты» без времени — ближайшая суббота 12:00, как раньше.
export const planEventStart = ({
  decidedAt,
  mode,
  now,
  scheduledFor,
}: PlanTimingInput): Date =>
  scheduledFor
    ? new Date(scheduledFor)
    : mode === "live"
      ? liveStart(decidedAt)
      : nextSaturdayNoon(now);

export const buildIcs = (event: CalendarEvent, now: number): string => {
  const end = new Date(event.start.getTime() + event.durationMinutes * 60_000);
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//SwipeIt//Demo//RU",
    "CALSCALE:GREGORIAN",
    "BEGIN:VEVENT",
    `UID:${event.uid}@swipeit`,
    `DTSTAMP:${stamp(new Date(now))}`,
    `DTSTART:${stamp(event.start)}`,
    `DTEND:${stamp(end)}`,
    `SUMMARY:${escapeText(event.title)}`,
    `DESCRIPTION:${escapeText(event.description)}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ]
    .map(foldLine)
    .join("\r\n");
};

// Скачать .ics: на телефоне файл открывается в календаре.
export const downloadIcs = (fileName: string, ics: string) => {
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
