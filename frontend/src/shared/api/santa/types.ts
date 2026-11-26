import { z } from "zod";

// Тайный Санта (TECH_SPEC §5).
export const SantaGameSchema = z.object({
  id: z.string(),
  title: z.string(),
  ownerId: z.string(),
  budget: z.number().nonnegative(),
  exchangeDate: z.string(),
  // Если задано — жеребьёвка автоматически в это время.
  drawAt: z.string().optional(),
  status: z.enum(["gathering", "drawn"]),
  participantIds: z.array(z.string()),
  // Пары, которые не дарят друг другу (в обе стороны).
  exclusions: z.array(z.tuple([z.string(), z.string()])),
  // santaId → wardId.
  assignments: z.record(z.string(), z.string()).optional(),
  openedIds: z.array(z.string()),
  boughtIds: z.array(z.string()),
  createdAt: z.string(),
});

export type SantaGame = z.infer<typeof SantaGameSchema>;
