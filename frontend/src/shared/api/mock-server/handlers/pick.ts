import { nanoid } from "nanoid";
import { z } from "zod";

import {
  decodePickAnswer,
  encodePickAnswer,
  encodePickRequest,
} from "@/shared/lib/share-codec";

import { ProductFiltersSchema } from "../../catalog/types";
import type { PickAnswer, PickRequest } from "../../pick/types";
import { type Handler, nowIso } from "../context";
import type { Db } from "../db";
import { validation } from "../errors";
import { parseInput, requireUser } from "./common";
import { OccasionInputSchema } from "./guest";

// «Выбери подарок сам» (TECH_SPEC §6, §8; DESIGN.md §8.6). Ссылка-фильтр
// уходит другу, друг свайпает в контексте pick — эти свайпы не трогают его
// вишлист, — и возвращает ссылку-ответ с выбранными подарками.

const CreateBodySchema = z.object({
  toName: z.string().trim().max(40, "Имя — до 40 символов").optional(),
  filters: ProductFiltersSchema,
  hidePrices: z.boolean(),
  occasion: OccasionInputSchema.optional(),
  message: z.string().trim().max(200, "Сообщение — до 200 символов").optional(),
});

const ImportBodySchema = z.object({ encoded: z.string().min(1) });

const isLike = (decision: string) =>
  decision === "like" || decision === "superlike";

// Лайки пользователя в ленте этой ссылки — в порядке свайпов.
const picksOf = (db: Db, userId: string, requestId: string) =>
  db.productSwipes
    .filter(
      (swipe) =>
        swipe.userId === userId &&
        swipe.context.kind === "pick" &&
        swipe.context.requestId === requestId &&
        isLike(swipe.decision),
    )
    .map((swipe) => ({
      productId: swipe.productId,
      priority:
        swipe.decision === "superlike" ? ("top" as const) : ("normal" as const),
      variantChoice: swipe.variantChoice,
    }));

// POST /pick-requests — ссылка-фильтр. Путь относительный, адрес сайта
// добавляет клиент (как у /wishlist/share).
export const createPickRequest: Handler = async (ctx, { body }) => {
  const input = parseInput(CreateBodySchema, body);
  const request = await ctx.db.write((db): PickRequest => {
    const user = requireUser(ctx, db);
    const created: PickRequest = {
      id: `pk_${nanoid(10)}`,
      from: {
        name: user.name,
        avatarColor: user.avatarColor,
        userId: user.id,
        gender: user.audience === "all" ? undefined : user.audience,
      },
      toName: input.toName || undefined,
      filters: input.filters,
      hidePrices: input.hidePrices,
      occasion: input.occasion,
      message: input.message || undefined,
      createdAt: nowIso(ctx.clock),
    };
    db.pickRequests[created.id] = created;
    return created;
  });
  return { url: `/pick/?d=${encodePickRequest(request)}`, request };
};

// GET /pick-requests/:id/picks — сколько друг уже выбрал по этой ссылке
// (для кнопки «Отправить выбор Азамату» после 3 «Хочу»). Расширение
// контракта TECH_SPEC §6: ответ собирается из тех же свайпов.
export const getMyPicks: Handler = async (ctx, { params }) => {
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  return { picks: picksOf(db, user.id, params.id ?? "") };
};

// POST /pick-requests/:id/answer — ссылка-ответ из «Хочу» друга в ленте
// этой ссылки. Пол — по «Показывать подарки: для неё / для него», чтобы
// отправитель прочитал «Айгерим выбрала».
export const answerPickRequest: Handler = async (ctx, { params }) => {
  const requestId = params.id ?? "";
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  const picks = picksOf(db, user.id, requestId);
  if (picks.length === 0)
    throw validation("Сначала выбери хотя бы один подарок");
  const answer: PickAnswer = {
    requestId,
    by: {
      name: user.name,
      avatarColor: user.avatarColor,
      gender: user.audience === "all" ? undefined : user.audience,
      userId: user.id,
    },
    picks,
    answeredAt: nowIso(ctx.clock),
  };
  return { url: `/pick/answer/?d=${encodePickAnswer(answer)}`, answer };
};

// POST /pick-answers — отправитель открыл ссылку-ответ: сохраняем выбор
// (повторное открытие или обновлённый ответ того же друга заменяют прежний;
// друзья различаются по id профиля, а не по имени) и, если запрос был
// создан на этом устройстве, отдаём его — там повод и скрытие цен.
export const importPickAnswer: Handler = async (ctx, { body }) => {
  const { encoded } = parseInput(ImportBodySchema, body);
  const decoded = decodePickAnswer(encoded);
  if (!decoded) throw validation("Ссылка повреждена");
  const at = nowIso(ctx.clock);
  return ctx.db.write((db) => {
    const sameAnswer = (answer: PickAnswer) =>
      answer.requestId === decoded.requestId &&
      (answer.by.userId ?? answer.by.name) ===
        (decoded.by.userId ?? decoded.by.name);
    const previous = db.pickAnswers.find(sameAnswer);
    const answer: PickAnswer = {
      ...decoded,
      answeredAt: previous?.answeredAt ?? at,
    };
    db.pickAnswers = [
      ...db.pickAnswers.filter((item) => !sameAnswer(item)),
      answer,
    ];
    return { answer, request: db.pickRequests[decoded.requestId] ?? null };
  });
};
