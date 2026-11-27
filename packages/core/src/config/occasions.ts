// Поводы вишлиста и значимые даты (TECH_SPEC §5 WishlistMeta.occasion,
// ImportantDate; DESIGN §8.4). Справочник — в shared: им пользуются и
// мок-сервер (снимок в ссылке), и экраны, и кодек ссылок.

export const OCCASION_KINDS = [
  "birthday",
  "new_year",
  "march_8",
  "just_because",
  "important",
  // Только старые данные и ссылки: новый интерфейс его не создаёт.
  "custom",
] as const;
export type OccasionKind = (typeof OCCASION_KINDS)[number];

// Праздники с постоянной датой (шаг «К какому дню…»): в значимые даты не
// сохраняются, дату ставит сервер.
export const FIXED_OCCASION_DATES = {
  new_year: "12-31",
  march_8: "03-08",
} as const satisfies Partial<Record<OccasionKind, string>>;

// Как повод называется у владельца: строки шага «К какому дню…», профиль.
export const OCCASION_LABELS: Record<
  Exclude<OccasionKind, "custom" | "important">,
  string
> = {
  birthday: "День рождения",
  new_year: "Новый год",
  march_8: "8 Марта",
  just_because: "Просто так",
};

// Как повод видят гости (DESIGN §8.4): «на день рождения, 14 марта». У
// 8 Марта дата уже в названии — после фразы её не пишем.
export const OCCASION_PHRASES: Record<
  Exclude<OccasionKind, "custom" | "important">,
  string
> = {
  birthday: "на день рождения",
  new_year: "на Новый год",
  march_8: "на 8 Марта",
  just_because: "просто так",
};
export const OCCASION_DATE_IN_PHRASE: ReadonlySet<string> =
  new Set<OccasionKind>(["march_8"]);

// «Что за повод?» (DESIGN §8.4, шаг 3б) — готовые поводы значимой даты.
export const IMPORTANT_DATE_PRESETS = [
  "anniversary",
  "wedding",
  "graduation",
  "housewarming",
] as const;
export type ImportantDatePreset = (typeof IMPORTANT_DATE_PRESETS)[number];

// Подпись готового повода — у владельца: чип, строка «Мои даты».
export const IMPORTANT_DATE_PRESET_LABELS: Record<ImportantDatePreset, string> =
  {
    anniversary: "Годовщина",
    wedding: "Свадьба",
    graduation: "Выпускной",
    housewarming: "Новоселье",
  };

// Фраза для гостей: «на годовщину, 2 июня». Свободный текст не склоняем —
// поэтому своё название в ссылку не попадает, а гость видит «к 2 июня».
export const IMPORTANT_DATE_PRESET_PHRASES: Record<
  ImportantDatePreset,
  string
> = {
  anniversary: "на годовщину",
  wedding: "на свадьбу",
  graduation: "на выпускной",
  housewarming: "на новоселье",
};

// Значимая дата без готового повода — гостю «к 2 июня».
export const IMPORTANT_DATE_PHRASE_PREFIX = "к";

// Своё название даты — до 40 символов (поле «Свой вариант»).
export const IMPORTANT_DATE_LABEL_MAX = 40;

// Название значимой даты у владельца: своё название, иначе подпись
// готового повода, иначе «Значимая дата N» (TECH_SPEC §5 ImportantDate).
export const importantDateTitle = (date: {
  autoNumber: number;
  label?: string;
  preset?: ImportantDatePreset;
}): string =>
  date.label?.trim() ||
  (date.preset ? IMPORTANT_DATE_PRESET_LABELS[date.preset] : "") ||
  `Значимая дата ${date.autoNumber}`;

// Напоминание о своём дне рождения: «Через 26 дней твой день рождения».
export const BIRTHDAY_REMINDER_LABEL = "твой день рождения";
