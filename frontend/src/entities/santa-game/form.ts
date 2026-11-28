import type { SantaGamePublic, UpdateSantaInput } from "@/shared/api";
import { toDateKey } from "@/shared/lib/format";

// Поля игры Тайного Санты — одни и те же при создании и в «Изменить игру»
// (R03): название, бюджет с подсказками, дата обмена, жеребьёвка вручную
// или по дате (DESIGN.md §8.8).

export const BUDGET_HINTS = [1000, 2000, 3000, 5000] as const;

const DAY = 24 * 60 * 60 * 1000;

// Значения формы — как в полях ввода: бюджет строкой (человек мог ввести
// «2 000»), drawAt — локальное «YYYY-MM-DDTHH:mm» поля datetime-local.
export type SantaFormValues = {
  budget: string;
  drawAt: string;
  drawMode: "date" | "manual";
  exchangeDate: string;
  title: string;
};

const pad = (value: number) => String(value).padStart(2, "0");

// Время в формате datetime-local — по часам телефона, без часового пояса.
export const toLocalInput = (timestamp: number) => {
  const date = new Date(timestamp);
  return `${toDateKey(timestamp)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};

// Только цифры и пробелы-разделители: «1500.50» или «1,5» — ошибка, а не
// бюджет в сто раз больше или меньше. NaN — не число.
export const parseBudget = (text: string): number =>
  /^\s*\d[\d\s]*$/.test(text) ? Number(text.replace(/\s/g, "")) : Number.NaN;

// Пустое поле — без ошибки: кнопка и так неактивна, красный текст на
// только что открытой форме пугал бы.
export const budgetError = (text: string): string | undefined =>
  text.trim() && !(parseBudget(text) > 0)
    ? "Целое число в сомах, например 2 000"
    : undefined;

export const santaFormValid = (values: SantaFormValues): boolean =>
  values.title.trim().length > 0 &&
  parseBudget(values.budget) > 0 &&
  Boolean(values.exchangeDate) &&
  (values.drawMode === "manual" || !Number.isNaN(Date.parse(values.drawAt)));

// Новая игра: обмен через две недели, жеребьёвка по дате — через неделю.
export const newSantaForm = (now: number): SantaFormValues => ({
  title: "",
  budget: "2000",
  exchangeDate: toDateKey(now + 14 * DAY),
  drawMode: "manual",
  drawAt: toLocalInput(now + 7 * DAY),
});

// Форма правки — из игры. Жеребьёвки по дате нет — подставляем ту же
// неделю, что при создании: переключил на «По дате» — дата уже есть.
export const santaFormOf = (
  game: Pick<SantaGamePublic, "budget" | "drawAt" | "exchangeDate" | "title">,
  now: number,
): SantaFormValues => ({
  title: game.title,
  budget: String(game.budget),
  exchangeDate: game.exchangeDate,
  drawMode: game.drawAt ? "date" : "manual",
  drawAt: toLocalInput(game.drawAt ? Date.parse(game.drawAt) : now + 7 * DAY),
});

// Только изменённые поля: сервер проверяет даты, только если их меняли, —
// старая дата жеребьёвки могла пройти (R08), и правка бюджета не должна
// падать на «Дата жеребьёвки уже прошла». Пустой объект — менять нечего.
export const santaPatch = (
  game: Pick<SantaGamePublic, "budget" | "drawAt" | "exchangeDate" | "title">,
  values: SantaFormValues,
): UpdateSantaInput => {
  const patch: UpdateSantaInput = {};
  const title = values.title.trim();
  if (title !== game.title) patch.title = title;
  const budget = parseBudget(values.budget);
  if (budget !== game.budget) patch.budget = budget;
  if (values.exchangeDate !== game.exchangeDate) {
    patch.exchangeDate = values.exchangeDate;
  }
  if (values.drawMode === "manual") {
    if (game.drawAt) patch.drawMode = "manual";
  } else if (
    !game.drawAt ||
    toLocalInput(Date.parse(game.drawAt)) !== values.drawAt
  ) {
    patch.drawMode = "date";
    patch.drawAt = new Date(values.drawAt).toISOString();
  }
  return patch;
};
