import { BIRTHDAY_REMINDER_LABEL, importantDateTitle } from "../config/index";

import type { ImportantDate, Reminder, User } from "../api/users/types";

// Даты и напоминания (TECH_SPEC §6 «Даты и напоминания»). Чистые функции без
// браузерных API — их зовут обработчики и во вкладке, и на LAN-сервере.
// Дни считаются по местному календарю — как daysUntilBirthday в
// shared/lib/format (в демо это Бишкек). Своя арифметика, а не его: там
// 29 февраля в невисокосный год уезжает на 1 марта, а здесь нужно 28-е.

const DAY = 24 * 60 * 60 * 1000;
// Напоминаем за 30 дней — «за месяц до даты».
export const REMINDER_WINDOW_DAYS = 30;

const pad = (value: number) => String(value).padStart(2, "0");

const isLeap = (year: number) =>
  (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;

const parseMonthDay = (monthDay: string) => {
  const [month = 1, day = 1] = monthDay.split("-").map(Number);
  return { month, day };
};

// Этот день-месяц в данном году: 29 февраля в невисокосный год — 28-е.
const inYear = (monthDay: string, year: number) => {
  const { month, day } = parseMonthDay(monthDay);
  const fixedDay = month === 2 && day === 29 && !isLeap(year) ? 28 : day;
  return new Date(year, month - 1, fixedDay);
};

const startOfDay = (timestamp: number) => {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  return date;
};

const dateKeyOf = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;

// Ближайшее наступление "MM-DD" — сегодня или позже, "YYYY-MM-DD".
// 20 декабря и "01-10" — это 10 января следующего года.
export const nextOccurrence = (monthDay: string, now: number): string => {
  const today = startOfDay(now);
  let target = inYear(monthDay, today.getFullYear());
  if (target < today) target = inYear(monthDay, today.getFullYear() + 1);
  return dateKeyOf(target);
};

// Наступление через yearsAhead лет после ближайшего: для перемотки, когда
// ближайшее уже скрыто «Скрыть».
const occurrenceFrom = (monthDay: string, now: number, yearsAhead: number) => {
  const first = nextOccurrence(monthDay, now);
  const year = Number(first.slice(0, 4)) + yearsAhead;
  return yearsAhead === 0 ? first : dateKeyOf(inYear(monthDay, year));
};

// Сколько дней от now до "YYYY-MM-DD" (0 — сегодня). round, а не floor: при
// переходе на летнее время в сутках 23 или 25 часов.
export const daysUntil = (dateKey: string, now: number): number => {
  const [year = 0, month = 1, day = 1] = dateKey.split("-").map(Number);
  const target = new Date(year, month - 1, day);
  return Math.round((target.getTime() - startOfDay(now).getTime()) / DAY);
};

// «Значимая дата N»: наименьшее натуральное N, не занятое датами без своего
// названия и без готового повода. У дат с названием номер не виден и не
// занят — иначе после «Годовщины» шла бы «Значимая дата 2».
export const nextAutoNumber = (
  dates: readonly Pick<ImportantDate, "autoNumber" | "label" | "preset">[],
): number => {
  const taken = new Set(
    dates
      .filter((date) => !date.label && !date.preset)
      .map((date) => date.autoNumber),
  );
  let n = 1;
  while (taken.has(n)) n += 1;
  return n;
};

// Ключ даты в id напоминания: "birthday" или id значимой даты.
export const BIRTHDAY_KEY = "birthday";
export const reminderId = (key: string, dateKey: string) =>
  `${key}:${dateKey.slice(0, 4)}`;

type Candidate = {
  dateId?: string;
  key: string;
  kind: Reminder["kind"];
  label: string;
  monthDay: string;
};

const candidatesOf = (
  user: Pick<User, "birthday">,
  dates: readonly ImportantDate[],
): Candidate[] => [
  ...(user.birthday
    ? [
        {
          key: BIRTHDAY_KEY,
          kind: "birthday" as const,
          label: BIRTHDAY_REMINDER_LABEL,
          monthDay: user.birthday,
        },
      ]
    : []),
  ...dates.map((date) => ({
    key: date.id,
    kind: "important" as const,
    dateId: date.id,
    label: importantDateTitle(date),
    monthDay: date.date,
  })),
];

// Активное напоминание (TECH_SPEC §6): кандидаты — день рождения и каждая
// значимая дата; до ближайшего наступления 0–30 дней; скрытые «Скрыть» не
// показываем. Из оставшихся — одно, ближайшее. id с годом наступления —
// поэтому «Скрыть» действует до следующего года: «раз в год, за месяц».
export const activeReminder = (
  user: Pick<User, "birthday" | "dismissedReminders">,
  dates: readonly ImportantDate[],
  now: number,
): null | Reminder => {
  const dismissed = new Set(user.dismissedReminders ?? []);
  let best: null | Reminder = null;
  for (const candidate of candidatesOf(user, dates)) {
    const date = nextOccurrence(candidate.monthDay, now);
    const daysLeft = daysUntil(date, now);
    const id = reminderId(candidate.key, date);
    if (daysLeft > REMINDER_WINDOW_DAYS || dismissed.has(id)) continue;
    if (best && best.daysLeft <= daysLeft) continue;
    best = {
      id,
      kind: candidate.kind,
      ...(candidate.dateId ? { dateId: candidate.dateId } : {}),
      label: candidate.label,
      date,
      daysLeft,
    };
  }
  return best;
};

// «Перемотать к напоминанию» (POST /demo/clock/to-reminder): ближайшее
// наступление своей даты, напоминание о котором ещё не скрыто (это может быть
// та же дата через год), и момент за 30 дней до него — полдень, чтобы
// «через 30 дней» не съехало на соседний день. null — своих дат нет.
export const reminderJumpTarget = (
  user: Pick<User, "birthday" | "dismissedReminders">,
  dates: readonly ImportantDate[],
  now: number,
): { at: number; date: string; id: string } | null => {
  const dismissed = new Set(user.dismissedReminders ?? []);
  // Полдень за 30 дней до даты — туда встают часы.
  const windowStart = (date: string) => {
    const [year = 0, month = 1, day = 1] = date.split("-").map(Number);
    return new Date(year, month - 1, day - REMINDER_WINDOW_DAYS, 12).getTime();
  };
  let best: { at: number; date: string; id: string } | null = null;
  for (const candidate of candidatesOf(user, dates)) {
    // Скрытые за много лет вперёд в демо не бывают, но цикл ограничен.
    for (let years = 0; years < 50; years += 1) {
      const date = occurrenceFrom(candidate.monthDay, now, years);
      const id = reminderId(candidate.key, date);
      if (dismissed.has(id)) continue;
      // Часы демо только вперёд: если окно этой даты уже началось, берём
      // следующее наступление (ревью этапа 7) — иначе дедлайны планов и
      // «через N дней» уехали бы в прошлое.
      const at = windowStart(date);
      if (at < now) continue;
      if (!best || date < best.date) best = { at, date, id };
      break;
    }
  }
  return best;
};

// ── День рождения друга на «Вишлисте» (auto-tasks P03) ───────────────────

// Карточка — за 14 дней: за месяц про чужой праздник рано.
export const FRIEND_REMINDER_WINDOW_DAYS = 14;

// "friend:<id друга>:2027" — в тех же скрытых напоминаниях профиля: «Скрыть»
// прячет друга до следующего года.
export const friendReminderId = (friendId: string, dateKey: string) =>
  reminderId(`friend:${friendId}`, dateKey);

export type FriendBirthdayReminder = {
  date: string;
  daysLeft: number;
  friendId: string;
  id: string;
  // Сколько ещё друзей с днём рождения в окне (ссылка «ещё 2» → «Друзья»).
  more: number;
  name: string;
};

// Ближайший день рождения друга в окне 0–14 дней, не скрытый «Скрыть».
// Друзья без даты не считаются.
export const nearestFriendBirthday = (
  friends: ReadonlyArray<{
    user: { birthday?: string; id: string; name?: string };
  }>,
  dismissed: readonly string[],
  now: number,
): FriendBirthdayReminder | null => {
  const hidden = new Set(dismissed);
  const candidates = friends
    .flatMap(({ user }) => {
      if (!user.birthday) return [];
      const date = nextOccurrence(user.birthday, now);
      const daysLeft = daysUntil(date, now);
      const id = friendReminderId(user.id, date);
      if (daysLeft > FRIEND_REMINDER_WINDOW_DAYS || hidden.has(id)) return [];
      return [{ id, date, daysLeft, friendId: user.id, name: user.name ?? "" }];
    })
    .sort((a, b) => a.daysLeft - b.daysLeft || a.name.localeCompare(b.name));
  const [first] = candidates;
  return first ? { ...first, more: candidates.length - 1 } : null;
};
