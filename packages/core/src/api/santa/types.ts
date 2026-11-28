import { z } from "zod";

import type { PlanParticipant } from "../plans/types";
import {
  type GuestWishlist,
  type Occasion,
  WishlistIdSchema,
} from "../wishlist/types";

// Тайный Санта (TECH_SPEC §5).
export const SantaGameSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerId: z.string(),
  // Потолок цены подарка, сом (подсказки 1 000 / 2 000 / 3 000 / 5 000).
  budget: z.number().nonnegative(),
  // Дата обмена подарками: "YYYY-MM-DD".
  exchangeDate: z.string(),
  // Если задано — жеребьёвка автоматически в это время.
  drawAt: z.string().optional(),
  status: z.enum(["gathering", "drawn"]),
  // Вступившие, включая организатора. Только они участвуют в жеребьёвке.
  participantIds: z.array(z.string()),
  // Расширение TECH_SPEC §5: позваны организатором, но ещё не вступили.
  // Бот вступает через 2–10 с после создания (TECH_SPEC §7), человек — по
  // кнопке на экране игры или по ссылке. default — чтобы игры, сохранённые
  // без поля, читались.
  invitedIds: z.array(z.string()).default([]),
  // Пары, которые не дарят друг другу (в обе стороны). Наружу — только
  // организатору (S05): исключение рассказывает о людях («эти двое —
  // пара»), а в игре на 4–6 ещё и сужает, кто твой Санта. Остальным — [].
  exclusions: z.array(z.tuple([z.string(), z.string()])),
  // santaId → wardId. Наружу не отдаётся никогда — каждый видит только
  // своего подопечного (см. SantaView.me).
  assignments: z.record(z.string(), z.string()).optional(),
  // Расширение TECH_SPEC §5: когда прошла жеребьёвка.
  drawnAt: z.string().optional(),
  openedIds: z.array(z.string()),
  boughtIds: z.array(z.string()),
  // Кого организатор убрал из игры (Q05): снова вступить они не могут.
  // Наружу не отдаётся. default — чтобы игры без поля читались.
  removedIds: z.array(z.string()).default([]),
  // Жеребьёвка по дате не прошла (R08): когда и почему. Пока стоит,
  // планировщик игру пропускает; снимают вступление, выход, «Убрать» и
  // правка. Наружу — только в SantaView.drawFailed.
  drawFailed: z.object({ at: z.string(), reason: z.string() }).optional(),
  createdAt: z.string(),
});

export type SantaGame = z.infer<typeof SantaGameSchema>;

// Игра глазами клиента: без пар и без того, кто именно вскрыл конверт или
// купил подарок, — у всех видно только количество (DESIGN.md §8.8).
export type SantaGamePublic = Omit<
  SantaGame,
  "assignments" | "boughtIds" | "drawFailed" | "openedIds" | "removedIds"
>;

// ── Тела запросов ───────────────────────────────────────────────────

const TitleSchema = z
  .string()
  .trim()
  .min(1, "Напиши название")
  .max(60, "Название — до 60 символов");

const BudgetSchema = z
  .number({ error: "Укажи бюджет" })
  .int("Бюджет — целое число сомов")
  .min(1, "Укажи бюджет")
  .max(1_000_000, "Слишком большой бюджет");

const ExchangeDateSchema = z
  .string({ error: "Выбери дату обмена" })
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Выбери дату обмена")
  .refine((value) => !Number.isNaN(Date.parse(value)), "Такой даты нет");

const DrawAtSchema = z.iso.datetime({
  offset: true,
  error: "Выбери дату жеребьёвки",
});

const ExclusionsSchema = z
  .array(z.tuple([z.string().min(1), z.string().min(1)]))
  .max(100, "Слишком много исключений");

// Общее у создания и правки: как проводим жеребьёвку. manual — «вручную,
// когда все соберутся», date — автоматически в drawAt.
const DrawModeSchema = z.enum(["manual", "date"]);

// Тело POST /santa. Общая схема для формы создания и обработчика.
export const CreateSantaInputSchema = z
  .object({
    title: TitleSchema,
    budget: BudgetSchema,
    exchangeDate: ExchangeDateSchema,
    drawMode: DrawModeSchema.default("manual"),
    // Только для drawMode: "date" — ISO-строка.
    drawAt: DrawAtSchema.optional(),
    // Кого позвал организатор: друзья (люди и демо-боты). Они попадают в
    // «позваны» и вступают сами; организатор вступил с момента создания.
    participantIds: z.array(z.string().min(1)).max(29, "Не больше 30 человек"),
    exclusions: ExclusionsSchema.default([]),
    // Какой вишлист увидит Санта организатора (он тоже участник). Без него —
    // pickSantaWishlist (spec §2.9).
    wishlistId: WishlistIdSchema.optional(),
  })
  .refine((input) => input.drawMode === "manual" || Boolean(input.drawAt), {
    message: "Выбери дату жеребьёвки",
    path: ["drawAt"],
  });

// Тело PATCH /santa/:id — только организатор. До жеребьёвки — любые поля,
// после — только exchangeDate (R03: праздник перенесли), остальное —
// CONFLICT. drawMode: "manual" убирает автоматическую жеребьёвку.
export const UpdateSantaInputSchema = z
  .object({
    title: TitleSchema.optional(),
    budget: BudgetSchema.optional(),
    exchangeDate: ExchangeDateSchema.optional(),
    drawMode: DrawModeSchema.optional(),
    drawAt: DrawAtSchema.optional(),
    exclusions: ExclusionsSchema.optional(),
  })
  .refine((input) => input.drawMode !== "date" || Boolean(input.drawAt), {
    message: "Выбери дату жеребьёвки",
    path: ["drawAt"],
  });

// Тело POST /santa/:id/owner — «Передать роль организатора» (S04): кому.
// Только организатор и только вступившему; пары не меняются, и новый
// организатор их не видит.
export const HandOverSantaInputSchema = z.object({
  userId: z
    .string({ error: "Выбери, кому передать игру" })
    .min(1, "Выбери, кому передать игру"),
});

// Тело POST /santa/:id/join — какой вишлист увидит мой Санта. Без него —
// pickSantaWishlist (spec §2.9). Пустое тело — как раньше.
export const JoinSantaInputSchema = z.object({
  wishlistId: WishlistIdSchema.optional(),
});

// Тело POST /santa/:id/wishlist — сменить свой вишлист в игре. Можно и после
// жеребьёвки: Санта сразу видит новый (spec §2.9, §5.3).
export const SantaWishlistInputSchema = z.object({
  wishlistId: WishlistIdSchema,
});

export type CreateSantaInput = z.input<typeof CreateSantaInputSchema>;
export type JoinSantaInput = z.input<typeof JoinSantaInputSchema>;
export type SantaWishlistInput = z.input<typeof SantaWishlistInputSchema>;
export type HandOverSantaInput = z.input<typeof HandOverSantaInputSchema>;
export type UpdateSantaInput = z.input<typeof UpdateSantaInputSchema>;

// ── Ответы API ──────────────────────────────────────────────────────

// Участник игры: профиль и вишлист. hasWishlist — есть хотя бы одно
// активное желание; wishesInBudget — сколько из них в бюджете игры (по
// нижней цене): по нему считают «вишлист готов / мало в бюджете / без
// вишлиста» (logic/santa-wishlist, auto-tasks-ux-6 Z03). joined: false —
// позван, но ещё не вступил. Гостю (role: "guest" — превью по ссылке, X07)
// — только профиль и joined: hasWishlist, wishesInBudget и opened ему не
// приходят (S05).
export type SantaMember = PlanParticipant & {
  hasWishlist?: boolean;
  joined: boolean;
  // Вскрыл письмо (auto-tasks-pm-2 Q06): о паре ничего не говорит, а
  // организатору видно, кому напомнить. Покупка — по-прежнему только
  // счётчиком.
  opened?: boolean;
  wishesInBudget?: number;
};

// Конверт (DESIGN.md §7 SantaEnvelope): sealed — до жеребьёвки, ready —
// пара есть, конверт не вскрыт, opened — вскрыт (сохраняется).
export type SantaEnvelopeState = "opened" | "ready" | "sealed";

// Желание подопечного с ценой: у товара — из каталога, у своего — что
// указал владелец (null — цена не указана). overBudget — дешевле всего
// дороже бюджета игры: такие свёрнуты под «Дороже бюджета: N».
export type SantaWardItem = GuestWishlist["items"][number] & {
  overBudget: boolean;
  priceMax: null | number;
  priceMin: null | number;
  // Чужая открытая бронь (UX-аудит X02): друзья уже выбрали — Санте взять
  // другое. Кто бронировал — не видно.
  reserved?: boolean;
  // Моя бронь — «Купил: …» в письме Санты.
  reservedByMe?: boolean;
};

// Подопечный — только свой, только после жеребьёвки.
export type SantaWard = PlanParticipant & {
  // Повод и сообщение из его вишлиста — как у гостя.
  message?: string;
  occasion?: Occasion;
  // Желаний дороже бюджета — для «Дороже бюджета: 4».
  overBudgetCount: number;
  wishlist: SantaWardItem[];
};

// Моё в игре. null в SantaView.me — я не участник (позван или чужой).
export type SantaMe = {
  bought: boolean;
  envelope: SantaEnvelopeState;
  // Подопечный удалил профиль, а он дарил мне (пара двоих, Q05): в этой
  // игре я больше не дарю. Только на сервере — в демо профиль не удаляется.
  wardLeft?: boolean;
  // Есть сразу после жеребьёвки (до вскрытия — чтобы анимация конверта не
  // ждала сети). Показывать — только когда envelope === "opened".
  ward: null | SantaWard;
  // Мой выбранный вишлист в игре (spec §2.9, §4.8) — только мне: другим
  // участникам и организатору название не уходит. Нет поля — мок и сервер
  // ещё не знают о выборе (до L07).
  wishlist?: null | { id: string; name: string };
};

// GET /santa/:id и ответы всех действий с игрой.
export type SantaView = {
  boughtCount: number;
  // Почему жеребьёвку сейчас провести нельзя (меньше 3 вступивших,
  // невозможные исключения); null — можно или она уже прошла. Только
  // организатору (S05): в тексте имена из исключений («Азамату некому
  // дарить»). Остальным всегда null — их строку экран собирает сам из
  // состава игры.
  drawIssue: null | string;
  game: SantaGamePublic;
  me: null | SantaMe;
  // Сначала вступившие (организатор первым), потом позванные.
  members: SantaMember[];
  openedCount: number;
  // Организатор убрал меня из этой игры (Z01): вступить снова нельзя, и
  // экран приглашения говорит об этом прямо. Только самому убранному — кого
  // ещё убрали, другим не видно.
  removed?: boolean;
  role: "guest" | "invited" | "owner" | "participant";
  // Жеребьёвка по дате не прошла (R08): когда и почему. Пока игра не
  // изменилась, по дате её больше не пробуют. Нет поля или null — всё в
  // порядке. reason — только организатору (S05): остальные видят «ждём
  // организатора», а причина называет людей из исключений.
  drawFailed?: null | { at: string; reason?: string };
};

// Элемент GET /santa — карточка игры в списке. Подопечный — только после
// вскрытия конверта: список не должен испортить сюрприз.
export type SantaSummary = Omit<SantaView, "me"> & {
  me: null | (Omit<SantaMe, "ward"> & { ward: null | PlanParticipant });
};

// Ответ POST /santa/tick — планировщика жеребьёвки по дате.
export type SantaTickResult = {
  drawn: string[];
  // Дата наступила, а провести нельзя (меньше 3, исключения): игра ждёт
  // организатора, ничего не записано. Причина — та же, что в drawIssue.
  failed: Array<{ id: string; reason: string }>;
};
