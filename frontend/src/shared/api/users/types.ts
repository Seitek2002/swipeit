import { z } from "zod";

import { AUDIENCES, AVATAR_COLORS } from "@/shared/config";

export const BotProfileSchema = z.object({
  // CategoryId | ActivityCategoryId — бот любит и подарки, и занятия.
  likesCategories: z.array(z.string()),
  // Базовая вероятность «Хочу»; для любимых категорий +0.35 (TECH_SPEC §7).
  likeProbability: z.number().min(0).max(1),
  // У каждого бота свой темп: 0.7..1.4.
  speedFactor: z.number().positive(),
});

export const UserSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  avatarColor: z.enum(AVATAR_COLORS),
  // "MM-DD" — год не спрашиваем.
  birthday: z
    .string()
    .regex(/^\d{2}-\d{2}$/)
    .optional(),
  interests: z.array(z.string()),
  audience: z.enum(AUDIENCES),
  isBot: z.boolean(),
  bot: BotProfileSchema.optional(),
  createdAt: z.string(),
});

export type BotProfile = z.infer<typeof BotProfileSchema>;
export type User = z.infer<typeof UserSchema>;

// Друг в списке: профиль и сколько дней до его дня рождения (null — дата не
// указана). Ближайшие — сверху (DESIGN.md §8.9).
export type FriendSummary = { daysToBirthday: null | number; user: User };

export type NewUserInput = Pick<
  User,
  "audience" | "avatarColor" | "birthday" | "interests" | "name"
>;
export type UpdateMeInput = Partial<NewUserInput>;

export const NewUserInputSchema = UserSchema.pick({
  name: true,
  avatarColor: true,
  birthday: true,
  interests: true,
  audience: true,
});
export const UpdateMeInputSchema = NewUserInputSchema.partial();
