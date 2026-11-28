import { z } from "zod";

import {
  AUDIENCES,
  AVATAR_COLORS,
  CATEGORY_IDS,
  IMPORTANT_DATE_LABEL_MAX,
  IMPORTANT_DATE_PRESETS,
  INTEREST_IDS,
} from "../../config/index";

// "MM-DD": месяц 01–12, день — какой бывает в этом месяце (29 февраля можно).
const DAYS_IN_MONTH = [31, 29, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isValidMonthDay = (value: string) => {
  const [month = 0, day = 0] = value.split("-").map(Number);
  return (
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (DAYS_IN_MONTH[month - 1] ?? 0)
  );
};

export const BotProfileSchema = z.object({
  // CategoryId | ActivityCategoryId — бот любит и подарки, и занятия.
  likesCategories: z.array(z.string()),
  // Базовая вероятность «Хочу»; для любимых категорий +0.35 (TECH_SPEC §7).
  likeProbability: z.number().min(0).max(1),
  // У каждого бота свой темп: 0.7..1.4.
  speedFactor: z.number().positive(),
});

// "MM-DD" — год не спрашиваем: дни рождения и праздники повторяются.
export const MonthDaySchema = z
  .string()
  .regex(/^\d{2}-\d{2}$/, "Дата — в виде ММ-ДД")
  .refine(isValidMonthDay, "Такой даты нет");

// Одноразовые подсказки, которые человек уже видел (TECH_SPEC §5 HintId):
// обучающая карточка ленты и тост «Подстроили ленту под твои „Хочу“».
export const HINT_IDS = ["deck_guide", "taste_toast"] as const;
export const HintIdSchema = z.enum(HINT_IDS);

// Вкус — сумма по свайпам в контексте self (TECH_SPEC §5 Taste, §6 «Вкус»).
// Считает сервер чистой функцией computeTaste, клиент только читает.
export const TasteSchema = z.object({
  // Вес интереса: «Хочу» +1, «Очень хочу» +2, «Мимо» −0.3, не ниже −3.
  interests: z.record(z.string(), z.number()),
  categories: z.partialRecord(z.enum(CATEGORY_IDS), z.number()),
  // Сколько «Хочу» у товаров «для неё» и «для него».
  audience: z.object({ female: z.number(), male: z.number() }),
  // like + superlike в self.
  likes: z.number().int().nonnegative(),
  // Время последнего свайпа, из которого посчитан вкус: так отмена свайпа
  // возвращает вкус точно в прежнее состояние.
  updatedAt: z.string(),
});

// Значимая дата (TECH_SPEC §5 ImportantDate) — личное: в ссылки и чужим не
// отдаётся. Название для владельца — importantDateTitle из shared/config.
export const ImportantDateSchema = z.object({
  id: z.string().min(1),
  ownerId: z.string().min(1),
  date: MonthDaySchema,
  preset: z.enum(IMPORTANT_DATE_PRESETS).optional(),
  label: z.string().min(1).max(IMPORTANT_DATE_LABEL_MAX).optional(),
  // Ставится при создании; виден, только пока нет ни label, ни preset.
  autoNumber: z.number().int().positive(),
  createdAt: z.string(),
});

// Напоминание за месяц до своей даты (TECH_SPEC §6 «Даты и напоминания»).
// Вычисляется сервером, в базе не хранится.
// id напоминания в «Скрыть»: "birthday:2027", "d_…:2027" или день рождения
// друга "friend:u_…:2027" (auto-tasks P03).
export const ReminderIdSchema = z
  .string()
  .regex(
    /^(birthday|new_year|d_[A-Za-z0-9_-]{1,40}|friend:[A-Za-z0-9_-]{1,40}):\d{4}$/,
    "Неверное напоминание",
  );

export const ReminderSchema = z.object({
  // "birthday:2027" или "<dateId>:2027": ключ даты + год наступления.
  id: z.string(),
  // new_year — сезонное «До Нового года» (auto-tasks P06).
  kind: z.enum(["birthday", "important", "new_year"]),
  dateId: z.string().optional(),
  // «твой день рождения» или название даты.
  label: z.string(),
  // "YYYY-MM-DD" ближайшего наступления.
  date: z.string(),
  // 0..30.
  daysLeft: z.number().int().min(0),
});

export const UserSchema = z.object({
  id: z.string().min(1),
  // Нет, пока человек не назвался: имя спрашиваем, когда его увидят другие
  // (DESIGN §8.1). Профили из старого онбординга с именем читаются как есть.
  name: z.string().min(1).optional(),
  avatarColor: z.enum(AVATAR_COLORS),
  birthday: MonthDaySchema.optional(),
  // Выбраны самим человеком в профиле; у нового профиля пусто.
  interests: z.array(z.string()),
  // Устарело с этапа 7: лента берёт ProductFilters.audience. Поле оставлено
  // для старых баз и ботов, у новых профилей — "all".
  audience: z.enum(AUDIENCES),
  // Все поля этапа 7 — необязательные: база, сохранённая до обновления,
  // читается без сброса (TECH_SPEC §5 «Совместимость»).
  seenHints: z.array(HintIdSchema).optional(),
  // «Не моё» — интерес больше не предлагаем, лента его опускает.
  mutedInterests: z.array(z.string()).optional(),
  taste: TasteSchema.optional(),
  // id напоминаний, скрытых кнопкой «Скрыть». В id есть год — поэтому
  // «Скрыть» действует до следующего года.
  dismissedReminders: z.array(z.string()).optional(),
  isBot: z.boolean(),
  bot: BotProfileSchema.optional(),
  createdAt: z.string(),
});

export type BotProfile = z.infer<typeof BotProfileSchema>;
export type User = z.infer<typeof UserSchema>;
export type HintId = z.infer<typeof HintIdSchema>;
export type Taste = z.infer<typeof TasteSchema>;
export type ImportantDate = z.infer<typeof ImportantDateSchema>;
export type Reminder = z.infer<typeof ReminderSchema>;
export type { ImportantDatePreset } from "../../config/index";

// GET /me/dates: дата и то, что сервер посчитал для экрана — название для
// владельца и ближайшее наступление ("YYYY-MM-DD"). Сортировка — по нему.
export type ImportantDateView = ImportantDate & {
  nextDate: string;
  title: string;
};

// POST /me/dates. autoNumber — только при «Отменить» после удаления: сервер
// оставит его, если номер свободен.
export const CreateDateInputSchema = z.object({
  date: MonthDaySchema,
  preset: z.enum(IMPORTANT_DATE_PRESETS).optional(),
  label: z
    .string()
    .trim()
    .max(
      IMPORTANT_DATE_LABEL_MAX,
      `Название — до ${IMPORTANT_DATE_LABEL_MAX} символов`,
    )
    .optional(),
  autoNumber: z.number().int().positive().max(999).optional(),
});
export type CreateDateInput = z.input<typeof CreateDateInputSchema>;

// PATCH /me/dates/:id. Пустое название или null — вернуть подпись готового
// повода или «Значимая дата N».
export const UpdateDateInputSchema = z.object({
  label: z
    .string()
    .trim()
    .max(
      IMPORTANT_DATE_LABEL_MAX,
      `Название — до ${IMPORTANT_DATE_LABEL_MAX} символов`,
    )
    .nullable()
    .optional(),
  date: MonthDaySchema.optional(),
});
export type UpdateDateInput = z.input<typeof UpdateDateInputSchema>;

// GET /me: профиль и вычисленные сервером поля (в базе не хранятся).
// inferredInterests — «Похоже, тебе нравится»: выведены из лайков, без уже
// выбранных и «Не моё», не больше 4 (TECH_SPEC §6 «Вкус»).
export type MeResponse = User & { inferredInterests: string[] };

// Профиль, который видят другие: всегда с именем (безымянных в друзьях и
// участниках нет — TECH_SPEC §7a, NAME_REQUIRED).
export type NamedUser = User & { name: string };

// Друг в списке: профиль и сколько дней до его дня рождения (null — дата не
// указана). Ближайшие — сверху (DESIGN.md §8.9).
export type FriendSummary = { daysToBirthday: null | number; user: NamedUser };

const NAME_MAX = 40;
export const NameSchema = z
  .string()
  .trim()
  .min(1, "Напиши имя")
  .max(NAME_MAX, `Имя — до ${NAME_MAX} символов`);

// POST /users — с этапа 7 без тела: профиль создаётся сам, под прелоадером
// (DESIGN §8.1). Поля оставлены необязательными для совместимости: ими
// пользуются тесты и старые клиенты (имя на /pick/ до T22).
// Откуда пришёл профиль — для воронки сервера (auto-tasks-pm-2 Q01):
// служебное поле, не личное. Мок его не читает.
export const USER_VIA = [
  "feed",
  "wishlist_link",
  "reservation",
  "plan_invite",
  "santa_invite",
  "pick_link",
] as const;

export const NewUserInputSchema = z.object({
  via: z.enum(USER_VIA).optional(),
  name: NameSchema.optional(),
  avatarColor: z.enum(AVATAR_COLORS).optional(),
  birthday: MonthDaySchema.optional(),
  interests: z.array(z.string()).optional(),
  audience: z.enum(AUDIENCES).optional(),
  // Гость по ссылке, который бронировал до профиля (мок и LAN): его брони
  // переходят в новый профиль (auto-tasks U02). Сервер это поле не читает —
  // там у гостя профиль с первой брони (BACKEND.md §3.1).
  guestId: z
    .string()
    .regex(/^g_[A-Za-z0-9_-]+$/)
    .optional(),
});
export type NewUserInput = z.input<typeof NewUserInputSchema>;

// Интерес из 20 известных (InterestId = string в каталоге, но у чипа в
// профиле должна быть подпись).
const KNOWN_INTERESTS: ReadonlySet<string> = new Set(INTEREST_IDS);
const KnownInterestSchema = z
  .string()
  .refine((id) => KNOWN_INTERESTS.has(id), "Такого интереса нет");

// PATCH /me — имя и фон аватара можно поменять в любой момент.
export const UpdateMeInputSchema = z.object({
  name: NameSchema.optional(),
  avatarColor: z.enum(AVATAR_COLORS).optional(),
  // "MM-DD" или null — убрать. Узнаём при отправке вишлиста (DESIGN §8.4).
  birthday: MonthDaySchema.nullable().optional(),
  // Свои интересы и «Не моё» (DESIGN §8.9 «Мне нравится»): только из 20
  // известных — у чипа должна быть подпись.
  interests: z.array(KnownInterestSchema).max(INTEREST_IDS.length).optional(),
  mutedInterests: z
    .array(KnownInterestSchema)
    .max(INTEREST_IDS.length)
    .optional(),
  audience: z.enum(AUDIENCES).optional(),
});
export type UpdateMeInput = z.input<typeof UpdateMeInputSchema>;

// POST /me/hints — подсказка показана.
export const MarkHintInputSchema = z.object({ id: HintIdSchema });
