import {
  IMPORTANT_DATE_PHRASE_PREFIX,
  IMPORTANT_DATE_PRESET_PHRASES,
  OCCASION_DATE_IN_PHRASE,
  OCCASION_PHRASES,
} from "../config/index";

import { NBSP } from "./format-price";
import { plural } from "./plural";

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const DAYS = ["день", "дня", "дней"] as const;
const HOURS = ["час", "часа", "часов"] as const;
const MINUTES = ["минута", "минуты", "минут"] as const;

const pad = (value: number) => String(value).padStart(2, "0");

// Обратный отсчёт (DESIGN.md §7 Countdown): «2 дня 4 часа», «5 часов
// 12 минут», меньше часа — «12:05» (минуты и секунды). Без слова «Осталось»:
// его добавляет компонент — согласование «Остался 1 день» решается там.
export const formatRemaining = (ms: number): string => {
  if (ms <= 0) return "0:00";
  if (ms >= DAY) {
    const days = Math.floor(ms / DAY);
    const hours = Math.floor((ms % DAY) / HOUR);
    const dayPart = `${days} ${plural(days, DAYS)}`;
    return hours > 0 ? `${dayPart} ${hours} ${plural(hours, HOURS)}` : dayPart;
  }
  if (ms >= HOUR) {
    const hours = Math.floor(ms / HOUR);
    const minutes = Math.floor((ms % HOUR) / MINUTE);
    const hourPart = `${hours} ${plural(hours, HOURS)}`;
    return minutes > 0
      ? `${hourPart} ${minutes} ${plural(minutes, MINUTES)}`
      : hourPart;
  }
  const totalSeconds = Math.ceil(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}:${pad(totalSeconds % 60)}`;
};

const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
};

// День рождения хранится как "MM-DD" (год не спрашиваем). Сколько дней до
// ближайшего: 0 — сегодня. 29 февраля в невисокосный год Date переносит на
// 1 марта — для демо это нормально.
export const daysUntilBirthday = (birthday: string, now: number): number => {
  const [month = 1, day = 1] = birthday.split("-").map(Number);
  const today = startOfDay(now);
  let target = new Date(today.getFullYear(), month - 1, day);
  if (target < today)
    target = new Date(today.getFullYear() + 1, month - 1, day);
  // round, а не floor: при переходе на летнее время в сутках 23 или 25 часов.
  return Math.round((target.getTime() - today.getTime()) / DAY);
};

// Дата ближайшего дня рождения "YYYY-MM-DD" — для повода вишлиста.
export const nextBirthdayDate = (birthday: string, now: number): string => {
  // От полуночи и через setDate: прибавка часов к now после 23:00 перескочила
  // бы на следующий день.
  const date = startOfDay(now);
  date.setDate(date.getDate() + daysUntilBirthday(birthday, now));
  return toDateKey(date.getTime());
};

// "MM-DD" через N дней от now — для сида: «у Нурай ДР через 5 дней».
export const birthdayInDays = (days: number, now: number): string => {
  const date = new Date(now + days * DAY);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// "YYYY-MM-DD" по местному времени.
export const toDateKey = (timestamp: number): string => {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// «Осталось» / «Остался» / «Осталась» — по первому числу отсчёта.
export const remainingVerb = (ms: number): string => {
  if (ms < HOUR) return "Осталось";
  const first = ms >= DAY ? Math.floor(ms / DAY) : Math.floor(ms / HOUR);
  const tail = first % 100;
  return tail % 10 === 1 && tail !== 11 ? "Остался" : "Осталось";
};

const MONTHS_GENITIVE = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

// Между числом и месяцем — неразрывный пробел: в узкой строке напоминания
// «10» оставалось в конце строки, а «декабря» уезжало на следующую.
const dayMonthOf = (value: string, space: string): string => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()}${space}${MONTHS_GENITIVE[date.getMonth()]}`;
};

// «14 марта» по ISO-дате или "YYYY-MM-DD".
export const formatDayMonth = (value: string): string =>
  dayMonthOf(value, NBSP);

// Дата повода "YYYY-MM-DD": «10 ноября», а если не в этом году —
// «10 ноября 2027» (UX-аудит W03): прошедший в этом году день уходит на
// следующий, и без года «на новоселье, 10 ноября» читалось как прошлое.
export const formatOccasionDate = (date: string, now?: number): string => {
  const dayMonth = formatDayMonth(date);
  if (now === undefined || !dayMonth) return dayMonth;
  const year = Number(date.slice(0, 4));
  return year && year !== new Date(now).getFullYear()
    ? `${dayMonth} ${year}`
    : dayMonth;
};

// День "YYYY-MM-DD" уже прошёл (сегодняшний — ещё нет).
export const isPastDate = (date: string, now: number): boolean =>
  date.slice(0, 10) < toDateKey(now);

// «10 ноября 2027 — через 11 месяцев», «14 марта — через 3 месяца», «3
// декабря — через 5 дней», «28 ноября — сегодня»: подпись пикера повода (W03).
export const formatAhead = (date: string, now: number): string => {
  const target = new Date(`${date.slice(0, 10)}T12:00:00`).getTime();
  const today = new Date(`${toDateKey(now)}T12:00:00`).getTime();
  const days = Math.round((target - today) / DAY);
  const when =
    days <= 0
      ? "сегодня"
      : days === 1
        ? "завтра"
        : days < 45
          ? `через ${days} ${plural(days, ["день", "дня", "дней"])}`
          : (() => {
              const months = Math.round(days / 30.44);
              return `через ${months} ${plural(months, ["месяц", "месяца", "месяцев"])}`;
            })();
  return `${formatOccasionDate(date, now)} — ${when}`;
};

type OccasionLike = {
  date?: string;
  kind: string;
  label?: string;
  preset?: string;
};

const PHRASES: Record<string, string> = OCCASION_PHRASES;
const PRESET_PHRASES: Record<string, string> = IMPORTANT_DATE_PRESET_PHRASES;

// Подзаголовок вишлиста так, как его видят гости (DESIGN.md §8.3, §8.4):
// «на день рождения, 14 марта», «на 8 Марта», «на годовщину, 2 июня».
// Значимая дата без готового повода — «к 2 июня»: своё название личное, в
// ссылку не попадает. Старый custom — его подпись как есть.
export const occasionLabel = (
  occasion?: OccasionLike,
  // С часами — год у даты не в этом году (W03).
  now?: number,
): string => {
  if (!occasion) return "";
  const date = occasion.date ? formatOccasionDate(occasion.date, now) : "";
  if (occasion.kind === "important") {
    const phrase = occasion.preset ? PRESET_PHRASES[occasion.preset] : "";
    if (phrase) return [phrase, date].filter(Boolean).join(", ");
    return date ? `${IMPORTANT_DATE_PHRASE_PREFIX} ${date}` : "";
  }
  const phrase =
    occasion.kind === "custom"
      ? (occasion.label ?? "").trim()
      : (PHRASES[occasion.kind] ?? "");
  // У 8 Марта дата уже в названии.
  if (OCCASION_DATE_IN_PHRASE.has(occasion.kind)) return phrase;
  return [phrase, date].filter(Boolean).join(", ");
};

// День рождения "MM-DD" → «14 марта» (год не хранится).
export const formatBirthday = (birthday: string): string => {
  const [month = 0, day = 0] = birthday.split("-").map(Number);
  const name = MONTHS_GENITIVE[month - 1];
  return name && day ? `${day}${NBSP}${name}` : "";
};
