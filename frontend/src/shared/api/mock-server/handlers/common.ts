import type { z } from "zod";

import type { User } from "../../users/types";
import type { HandlerContext } from "../context";
import type { Db } from "../db";
import { ApiError, notFound, validation } from "../errors";

// Пользователь запроса. Без сессии — FORBIDDEN; сессия есть, а профиля в базе
// нет (базу сбросили) — NOT_FOUND: клиент по нему уводит в онбординг.
export const requireUser = (ctx: HandlerContext, db: Db): User => {
  if (!ctx.userId) {
    throw new ApiError(403, "FORBIDDEN", "Сначала представься");
  }
  const user = db.users[ctx.userId];
  if (!user) throw notFound("Профиль не найден");
  return user;
};

// Тело и параметры запроса — недоверенные данные (в lan они приходят с
// чужого телефона), поэтому всегда через zod.
export const parseInput = <T>(schema: z.ZodType<T>, value: unknown): T => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw validation(result.error.issues[0]?.message ?? "Неверные данные");
  }
  return result.data;
};
