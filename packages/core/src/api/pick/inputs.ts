import { z } from "zod";

import { ProductFiltersSchema } from "../catalog/types";
import { OccasionInputSchema } from "../wishlist/inputs";
import { PICK_LIMIT_MAX } from "./limit";

// «Выбери подарок сам» — тела запросов, общие для мока и сервера
// (BACKEND.md B09).

// POST /pick-requests — ссылка-фильтр.
export const PickRequestInputSchema = z.object({
  toName: z.string().trim().max(40, "Имя — до 40 символов").optional(),
  filters: ProductFiltersSchema,
  hidePrices: z.boolean(),
  // «Сколько можно выбрать» — нет поля: сколько угодно.
  maxPicks: z
    .number()
    .int("Сколько подарков — целым числом")
    .min(1, "Хотя бы один подарок")
    .max(PICK_LIMIT_MAX, `Не больше ${PICK_LIMIT_MAX} подарков`)
    .optional(),
  occasion: OccasionInputSchema.optional(),
  message: z.string().trim().max(200, "Сообщение — до 200 символов").optional(),
});

// POST /pick-answers — ссылка-ответ из старой длинной ссылки.
export const PickAnswerImportSchema = z.object({ encoded: z.string().min(1) });
