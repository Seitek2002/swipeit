import type { ImportantDateView, Occasion, User } from "@/shared/api";
import { FIXED_OCCASION_DATES } from "@/shared/config";
import { formatBirthday } from "@/shared/lib/format";

// Шаги шторки отправки (DESIGN.md §8.4).
export type ShareStep =
  "calendar" | "is-birthday" | "name" | "send" | "what" | "when";

export type WhenIcon = "birthday" | "important" | "march_8" | "new_year";

export type WhenOption = {
  // До ближайшего наступления, в днях: ближайшая дата — первой.
  daysLeft: number;
  icon: WhenIcon;
  key: string;
  label: string;
  occasion: Occasion;
};

const pad = (value: number) => String(value).padStart(2, "0");

// "MM-DD" сегодняшнего дня по часам демо.
export const todayKey = (now: number) => {
  const date = new Date(now);
  return `${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Дней до ближайшего "MM-DD" (сегодня — 0). 29 февраля в невисокосный год —
// 28-е, как на сервере (TECH_SPEC §6 «Даты и напоминания»).
export const daysUntil = (monthDay: string, now: number): number => {
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const [month = 1, day = 1] = monthDay.split("-").map(Number);
  const at = (year: number) => {
    const leap = new Date(year, 1, 29).getMonth() === 1;
    return new Date(
      year,
      month - 1,
      month === 2 && day === 29 && !leap ? 28 : day,
    );
  };
  let next = at(today.getFullYear());
  if (next < today) next = at(today.getFullYear() + 1);
  return Math.round((next.getTime() - today.getTime()) / 86_400_000);
};

// Варианты шага «К какому дню друзьям готовить подарки?» (DESIGN.md §8.4):
// свой день рождения, сохранённые значимые даты, Новый год и 8 Марта —
// ближайшая первой.
export const whenOptions = (
  me: Pick<User, "birthday"> | undefined,
  dates: ImportantDateView[],
  now: number,
): WhenOption[] => {
  const options: WhenOption[] = [];
  if (me?.birthday) {
    options.push({
      key: "birthday",
      icon: "birthday",
      label: `Мой день рождения, ${formatBirthday(me.birthday)}`,
      occasion: { kind: "birthday" },
      daysLeft: daysUntil(me.birthday, now),
    });
  }
  for (const date of dates) {
    options.push({
      key: date.id,
      icon: "important",
      label: `${date.title}, ${formatBirthday(date.date)}`,
      occasion: { kind: "important", dateId: date.id },
      daysLeft: daysUntil(date.date, now),
    });
  }
  options.push(
    {
      key: "new_year",
      icon: "new_year",
      label: `Новый год, ${formatBirthday(FIXED_OCCASION_DATES.new_year)}`,
      occasion: { kind: "new_year" },
      daysLeft: daysUntil(FIXED_OCCASION_DATES.new_year, now),
    },
    {
      key: "march_8",
      icon: "march_8",
      label: "8 Марта",
      occasion: { kind: "march_8" },
      daysLeft: daysUntil(FIXED_OCCASION_DATES.march_8, now),
    },
  );
  return options.sort((a, b) => a.daysLeft - b.daysLeft);
};

// Дата из календаря уже известна — день рождения, значимая дата или
// праздник: повод без лишних вопросов. null — новая дата.
export const knownOccasionFor = (
  monthDay: string,
  me: Pick<User, "birthday"> | undefined,
  dates: ImportantDateView[],
): null | Occasion => {
  if (me?.birthday === monthDay) return { kind: "birthday" };
  const saved = dates.find((date) => date.date === monthDay);
  if (saved) return { kind: "important", dateId: saved.id };
  if (monthDay === FIXED_OCCASION_DATES.new_year) return { kind: "new_year" };
  if (monthDay === FIXED_OCCASION_DATES.march_8) return { kind: "march_8" };
  return null;
};

// После выбора в календаре: известная дата — сразу к отправке; день
// рождения ещё не знаем — спросить «Это твой день рождения?»; иначе —
// «Что за повод?» (DESIGN.md §8.4, шаги 3 и 3б).
export const stepAfterCalendar = (
  monthDay: string,
  me: Pick<User, "birthday"> | undefined,
  dates: ImportantDateView[],
): ShareStep => {
  if (knownOccasionFor(monthDay, me, dates)) return "send";
  return me?.birthday ? "what" : "is-birthday";
};

// "YYYY-MM-DD" ближайшего наступления "MM-DD".
export const nextDateOf = (monthDay: string, now: number) => {
  const date = new Date(now + daysUntil(monthDay, now) * 86_400_000);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

// Повод так, как его увидят гости (дата и готовый повод), — для шага
// отправки, пока сервер его ещё не вернул (повод из напоминания).
export const displayOccasion = (
  occasion: Occasion,
  me: Pick<User, "birthday"> | undefined,
  dates: ImportantDateView[],
  now: number,
): Occasion => {
  if (occasion.kind === "birthday" && me?.birthday) {
    return { ...occasion, date: nextDateOf(me.birthday, now) };
  }
  if (occasion.kind === "important") {
    const saved = dates.find((date) => date.id === occasion.dateId);
    if (saved) {
      return { ...occasion, preset: saved.preset, date: saved.nextDate };
    }
  }
  return occasion;
};
