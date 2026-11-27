import type { NewUserInput, User } from "@/entities/user";

import type { AvatarColor } from "@/shared/config";

export const NAME_MAX = 40;

// Поля профиля в форме. День рождения — два отдельных поля без года: так
// его удобно выбрать на телефоне, а в базу уходит "MM-DD". Интересов и
// аудитории здесь нет (TASKS T23): «Мне нравится» сохраняется сразу
// (features/taste-edit), а «Показывать подарки» — тот же стор, что фильтры
// ленты. Иначе «Сохранить» затирал бы их старыми значениями из черновика.
export type ProfileDraft = {
  avatarColor: AvatarColor;
  birthdayDay: string;
  birthdayMonth: string;
  name: string;
};

export const MONTHS_GENITIVE = [
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
] as const;

// 29 февраля можно: год не спрашиваем.
export const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const pad = (value: string) => value.padStart(2, "0");

export const toBirthday = (day: string, month: string): string | undefined =>
  day && month ? `${pad(month)}-${pad(day)}` : undefined;

export const fromBirthday = (birthday?: string) => {
  const [month = "", day = ""] = birthday?.split("-") ?? [];
  return {
    day: day ? String(Number(day)) : "",
    month: month ? String(Number(month)) : "",
  };
};

export const EMPTY_DRAFT: ProfileDraft = {
  name: "",
  avatarColor: "mandarin",
  birthdayDay: "",
  birthdayMonth: "",
};

export const draftFromUser = (user: User): ProfileDraft => {
  const { day, month } = fromBirthday(user.birthday);
  return {
    name: user.name ?? "",
    avatarColor: user.avatarColor,
    birthdayDay: day,
    birthdayMonth: month,
  };
};

export const toProfileInput = (draft: ProfileDraft): NewUserInput => ({
  // Имени может ещё не быть (DESIGN.md §8.1) — тогда поле не отправляем.
  name: draft.name.trim() || undefined,
  avatarColor: draft.avatarColor,
  birthday: toBirthday(draft.birthdayDay, draft.birthdayMonth),
});

export type ProfileErrors = {
  birthday?: string;
  name?: string;
};

// Предикаты валидации — чистые функции (как в imbir, CODESTYLE §7).
// Анкеты нет (DESIGN.md §8.1): имя необязательно, пока его не было, а уже
// данное стереть нельзя — его видят друзья. Минимума интересов больше нет:
// ленту подстраивают лайки.
export const validateProfile = (
  draft: ProfileDraft,
  hadName = false,
): ProfileErrors => {
  const errors: ProfileErrors = {};
  if (hadName && !draft.name.trim()) errors.name = "Напиши, как тебя зовут";
  if (Boolean(draft.birthdayDay) !== Boolean(draft.birthdayMonth)) {
    errors.birthday = "Выбери и день, и месяц — или оставь оба пустыми";
  }
  return errors;
};
