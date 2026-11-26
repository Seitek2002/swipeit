import { z } from "zod";

import { ACTIVITY_CATEGORY_IDS } from "@/shared/config";

// «Че делать будем?» (TECH_SPEC §5).
export const PlanSessionSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerId: z.string(),
  mode: z.enum(["live", "deadline"]),
  deadline: z.string().optional(),
  status: z.enum(["lobby", "swiping", "results", "decided"]),
  // Включая владельца.
  participantIds: z.array(z.string()),
  readyIds: z.array(z.string()),
  matchRule: z.enum(["all", "majority"]),
  filters: z.object({
    categories: z.array(z.enum(ACTIVITY_CATEGORY_IDS)),
    budgetPerPerson: z.object({ min: z.number(), max: z.number().nullable() }),
  }),
  // Порядок одинаковый для всех — перемешан один раз при старте.
  deck: z.array(z.string()),
  swipes: z.record(z.string(), z.record(z.string(), z.enum(["like", "pass"]))),
  finishedIds: z.array(z.string()),
  votes: z.record(z.string(), z.string()),
  decision: z
    .object({
      activityId: z.string(),
      method: z.enum(["random", "vote", "owner"]),
      decidedAt: z.string(),
      scheduledFor: z.string().optional(),
    })
    .optional(),
  createdAt: z.string(),
});

export type PlanSession = z.infer<typeof PlanSessionSchema>;
