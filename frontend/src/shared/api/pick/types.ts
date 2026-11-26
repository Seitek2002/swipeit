import { z } from "zod";

import { AVATAR_COLORS } from "@/shared/config";

import { ProductFiltersSchema } from "../catalog/types";
import { OccasionSchema } from "../wishlist/types";

const PersonSchema = z.object({
  name: z.string(),
  avatarColor: z.enum(AVATAR_COLORS),
});

// «Выбери подарок сам» (TECH_SPEC §5).
export const PickRequestSchema = z.object({
  id: z.string(),
  from: PersonSchema.extend({ userId: z.string().optional() }),
  toName: z.string().optional(),
  filters: ProductFiltersSchema,
  hidePrices: z.boolean(),
  occasion: OccasionSchema.optional(),
  message: z.string().optional(),
  createdAt: z.string(),
});

export const PickAnswerSchema = z.object({
  requestId: z.string(),
  by: PersonSchema,
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
