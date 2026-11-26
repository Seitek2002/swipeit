import type { NewUserInput, User } from "@/entities/user";

import type { Audience, AvatarColor } from "@/shared/config";

// Минимум интересов в онбординге (DESIGN.md §8.1): по ним подбирается лента.
export const MIN_INTERESTS = 3;
export const NAME_MAX = 40;

// Поля профиля в форме. День рождения — два отдельных поля без года: так
// его удобно выбрать на телефоне, а в базу уходит "MM-DD".
export type ProfileDraft = {
  audience: Audience;
  avatarColor: AvatarColor;
  birthdayDay: string;
  birthdayMonth: string;
  interests: string[];
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
  interests: [],
  audience: "all",
};

export const draftFromUser = (user: User): ProfileDraft => {
  const { day, month } = fromBirthday(user.birthday);
  return {
    name: user.name,
    avatarColor: user.avatarColor,
    birthdayDay: day,
    birthdayMonth: month,
    interests: user.interests,
    audience: user.audience,
  };
};

export const toProfileInput = (draft: ProfileDraft): NewUserInput => ({
  name: draft.name.trim(),
  avatarColor: draft.avatarColor,
  birthday: toBirthday(draft.birthdayDay, draft.birthdayMonth),
  interests: draft.interests,
  audience: draft.audience,
});

export type ProfileErrors = {
  birthday?: string;
  interests?: string;
  name?: string;
};

// Предикаты валидации — чистые функции (как в imbir, CODESTYLE §7).
export const validateProfile = (draft: ProfileDraft): ProfileErrors => {
  const errors: ProfileErrors = {};
  if (!draft.name.trim()) errors.name = "Напиши, как тебя зовут";
  if (Boolean(draft.birthdayDay) !== Boolean(draft.birthdayMonth)) {
    errors.birthday = "Выбери и день, и месяц — или оставь оба пустыми";
  }
  if (draft.interests.length < MIN_INTERESTS) {
    errors.interests = `Выбери хотя бы ${MIN_INTERESTS}`;
  }
  return errors;
};
