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

// «14 марта» по ISO-дате или "YYYY-MM-DD".
export const formatDayMonth = (value: string): string => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]}`;
};

type OccasionLike = { date?: string; kind: string; label?: string };

const OCCASION_PHRASE: Record<string, string> = {
  birthday: "на день рождения",
  new_year: "на Новый год",
  just_because: "просто так",
};

// Подзаголовок вишлиста: «на день рождения, 14 марта» (DESIGN.md §8.3).
export const occasionLabel = (occasion?: OccasionLike): string => {
  if (!occasion) return "";
  const phrase =
    occasion.kind === "custom"
      ? (occasion.label ?? "").trim()
      : (OCCASION_PHRASE[occasion.kind] ?? "");
  const date = occasion.date ? formatDayMonth(occasion.date) : "";
  return [phrase, date].filter(Boolean).join(", ");
};

// День рождения "MM-DD" → «14 марта» (год не хранится).
export const formatBirthday = (birthday: string): string => {
  const [month = 0, day = 0] = birthday.split("-").map(Number);
  const name = MONTHS_GENITIVE[month - 1];
  return name && day ? `${day} ${name}` : "";
};
