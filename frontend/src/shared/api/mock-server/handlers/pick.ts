import {
  PickAnswerImportSchema,
  PickRequestInputSchema,
} from "@swipeit/core/api/pick/inputs";
import { pickOccasionFrom } from "@swipeit/core/logic/occasion";
import { nanoid } from "nanoid";

import {
  decodePickAnswer,
  encodePickAnswer,
  encodePickRequest,
} from "@/shared/lib/share-codec";

import {
  type PickAnswer,
  type PickRequest,
  fitsPickLimit,
  upToGifts,
} from "../../pick/types";
import { type Handler, nowIso } from "../context";
import type { Db } from "../db";
import { validation } from "../errors";
import { parseInput, requireNamedUser, requireUser } from "./common";

// «Выбери подарок сам» (TECH_SPEC §6, §8; DESIGN.md §8.6). Ссылка-фильтр
// уходит другу, друг свайпает в контексте pick — эти свайпы не трогают его
// вишлист, — и возвращает ссылку-ответ с выбранными подарками.

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
  const input = parseInput(PickRequestInputSchema, body);
  const request = await ctx.db.write((db): PickRequest => {
    // Друг увидит «Азамат хочет подарить тебе подарок» — без имени нельзя.
    const user = requireNamedUser(ctx, db);
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
      maxPicks: input.maxPicks,
      // Повод — праздник получателя: свои даты и день рождения отправителя
      // не подставляем (auto-tasks U01).
      occasion: input.occasion
        ? pickOccasionFrom(input.occasion, ctx.clock.now())
        : undefined,
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
  // Отправитель увидит «Айгерим выбрала 5 подарков»: имя едет в ссылке.
  const user = requireNamedUser(ctx, db);
  const picks = picksOf(db, user.id, requestId);
  if (picks.length === 0)
    throw validation("Сначала выбери хотя бы один подарок");
  // «Сколько можно выбрать» — если запрос создан на этом устройстве (или в
  // общей базе lan): ссылка с другого телефона лимит несёт сама, его держит
  // экран друга.
  const maxPicks = db.pickRequests[requestId]?.maxPicks;
  if (!fitsPickLimit(picks.length, maxPicks)) {
    throw validation(
      `Можно выбрать ${upToGifts(maxPicks ?? 0)} — верни лишнее и отправь снова`,
    );
  }
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
  const { encoded } = parseInput(PickAnswerImportSchema, body);
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
