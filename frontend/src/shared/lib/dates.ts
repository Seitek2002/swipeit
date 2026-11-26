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

// «Осталось» / «Остался» / «Осталась» — по первому числу отсчёта.
export const remainingVerb = (ms: number): string => {
  if (ms < HOUR) return "Осталось";
  const first = ms >= DAY ? Math.floor(ms / DAY) : Math.floor(ms / HOUR);
  const tail = first % 100;
  return tail % 10 === 1 && tail !== 11 ? "Остался" : "Осталось";
};
