import type { z } from "zod";

import { validation } from "./errors";

// Тело, query и параметры запроса — недоверенные данные, поэтому всегда через
// zod (BACKEND.md §10). Первая ошибка схемы — в сообщение для экрана.
export const parseInput = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validation(result.error.issues[0]?.message ?? "Неверные данные");
  }
  return result.data;
};
