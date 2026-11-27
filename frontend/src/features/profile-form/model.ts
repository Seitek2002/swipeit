import type { UpdateMeInput, User } from "@/entities/user";

import type { AvatarColor } from "@/shared/config";

export const NAME_MAX = 40;

// Поля профиля в форме — только имя и фон аватара. Дня рождения здесь нет
// (TASKS T24): его узнаём при отправке вишлиста, а правят в «Мои даты»
// (features/important-dates) — там он сохраняется сразу. Интересов и
// аудитории тоже нет (TASKS T23): «Мне нравится» сохраняется сразу
// (features/taste-edit), а «Показывать подарки» — тот же стор, что фильтры
// ленты. Иначе «Сохранить» затирал бы их старыми значениями из черновика.
export type ProfileDraft = {
  avatarColor: AvatarColor;
  name: string;
};

export const EMPTY_DRAFT: ProfileDraft = {
  name: "",
  avatarColor: "mandarin",
};

export const draftFromUser = (user: User): ProfileDraft => ({
  name: user.name ?? "",
  avatarColor: user.avatarColor,
});

export const toProfileInput = (draft: ProfileDraft): UpdateMeInput => ({
  // Имени может ещё не быть (DESIGN.md §8.1) — тогда поле не отправляем.
  name: draft.name.trim() || undefined,
  avatarColor: draft.avatarColor,
});

export type ProfileErrors = {
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
  return errors;
};
