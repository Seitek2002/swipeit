import { z } from "zod";

import { AVATAR_COLORS } from "../../config/index";

import { ProductFiltersSchema } from "../catalog/types";
import { OccasionSchema } from "../wishlist/types";
import { PICK_LIMIT_MAX } from "./limit";

const PersonSchema = z.object({
  name: z.string(),
  avatarColor: z.enum(AVATAR_COLORS),
});

// Расширение TECH_SPEC §5: пол для «Отправить выбор Азамату» и «Айгерим
// выбрала» — из «Показывать подарки: для неё / для него»; «всем» — без рода.
const GenderSchema = z.enum(["female", "male"]);

// «Выбери подарок сам» (TECH_SPEC §5).
export const PickRequestSchema = z.object({
  id: z.string(),
  from: PersonSchema.extend({
    userId: z.string().optional(),
    gender: GenderSchema.optional(),
  }),
  toName: z.string().optional(),
  filters: ProductFiltersSchema,
  hidePrices: z.boolean(),
  // «Сколько можно выбрать»: друг лайкнет не больше стольких подарков. Нет
  // поля — сколько угодно (старые ссылки — тоже).
  maxPicks: z.number().int().min(1).max(PICK_LIMIT_MAX).optional(),
  occasion: OccasionSchema.optional(),
  message: z.string().optional(),
  createdAt: z.string(),
});

export const PickAnswerSchema = z.object({
  requestId: z.string(),
  by: PersonSchema.extend({
    gender: GenderSchema.optional(),
    userId: z.string().optional(),
  }),
  picks: z.array(
    z.object({
      productId: z.string(),
      priority: z.enum(["normal", "top"]),
      variantChoice: z.record(z.string(), z.string()).optional(),
    }),
  ),
  answeredAt: z.string(),
});

export type PickRequest = z.infer<typeof PickRequestSchema>;
export type PickAnswer = z.infer<typeof PickAnswerSchema>;
