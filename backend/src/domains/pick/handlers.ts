import type { ProductFilters } from "@swipeit/core/api/catalog/types";
import {
  PickAnswerImportSchema,
  PickRequestInputSchema,
} from "@swipeit/core/api/pick/inputs";
import type { PickAnswer, PickRequest } from "@swipeit/core/api/pick/types";
import type { Occasion } from "@swipeit/core/api/wishlist/types";
import { nameRequired, validation } from "@swipeit/core/errors";
import { pickOccasionFrom } from "@swipeit/core/logic/occasion";
import { parseInput } from "@swipeit/core/parse-input";
import { decodePickAnswer, encodePickAnswer } from "@swipeit/core/share-codec";
import { and, asc, eq, inArray } from "drizzle-orm";
import { nanoid } from "nanoid";

import type { ServerContext, ServerHandler, Tx } from "../../context";
import { pickAnswers, pickRequests, productSwipes } from "../../db/schema";
import { ensureShareLink, type ShareLinkRow } from "../share/links";
import { readMe, readUser, type UserRow } from "../users/queries";

// «Выбери подарок сам» (BACKEND.md B09): ссылка-фильтр и ответ — короткими
// ссылками, ответ хранится (один на друга, повтор заменяет). Свайпы друга по
// ссылке — в контексте pick:<id>: вкус и вишлист они не трогают (B06).

type RequestRow = typeof pickRequests.$inferSelect;

// Пол — по «Показывать подарки: для неё / для него»; «всем» — без рода.
const genderOf = (user: UserRow): { gender?: "female" | "male" } =>
  user.audience === "female" || user.audience === "male"
    ? { gender: user.audience }
    : {};

const personOf = (user: UserRow) => ({
  name: user.name ?? "",
  avatarColor: user.avatarColor as PickRequest["from"]["avatarColor"],
  userId: user.id,
  ...genderOf(user),
});

// Запрос из базы — тот же PickRequest, что у мока. Отправитель — его
// нынешний профиль (ссылка живая).
const toRequest = (row: RequestRow, from: UserRow): PickRequest => ({
  id: row.id,
  from: personOf(from),
  ...(row.toName ? { toName: row.toName } : {}),
  filters: row.filters as ProductFilters,
  hidePrices: row.hidePrices,
  ...(row.occasion ? { occasion: row.occasion as Occasion } : {}),
  ...(row.message ? { message: row.message } : {}),
  createdAt: row.createdAt.toISOString(),
});

const readRequest = async (tx: Tx, id: string) => {
  const [row] = await tx
    .select()
    .from(pickRequests)
    .where(eq(pickRequests.id, id))
    .limit(1);
  if (!row) return null;
  const from = await readUser(tx, row.fromUserId);
  return from ? toRequest(row, from) : null;
};

// POST /pick-requests → { url, code, request }. Друг увидит «Азамат хочет
// подарить тебе подарок» — без имени нельзя. Повод — как в ссылке вишлиста:
// у значимой даты только дата и готовый повод.
export const createPickRequest: ServerHandler = async (ctx, { body }) => {
  const input = parseInput(PickRequestInputSchema, body);
  const me = await readMe(ctx);
  if (!me.name) throw nameRequired();
  // Повод — праздник получателя: свои даты и день рождения отправителя не
  // подставляем (auto-tasks U01).
  const occasion = input.occasion
    ? pickOccasionFrom(input.occasion, ctx.clock.now())
    : undefined;
  const [row] = await ctx.tx
    .insert(pickRequests)
    .values({
      id: `pk_${nanoid(10)}`,
      fromUserId: me.id,
      toName: input.toName || null,
      filters: input.filters,
      hidePrices: input.hidePrices,
      occasion: occasion ?? null,
      message: input.message || null,
      createdAt: new Date(ctx.clock.now()),
    })
    .returning();
  if (!row) throw new Error("Запрос не записался");
  const link = await ensureShareLink(ctx, "pick_request", row.id, me.id);
  return { ...link, request: toRequest(row, me) };
};

const isLike = (decision: string) =>
  decision === "like" || decision === "superlike";

// Лайки человека в ленте этой ссылки — в порядке свайпов.
const picksOf = async (
  tx: Tx,
  userId: string,
  requestId: string,
): Promise<PickAnswer["picks"]> =>
  (
    await tx
      .select()
      .from(productSwipes)
      .where(
        and(
          eq(productSwipes.userId, userId),
          eq(productSwipes.contextKey, `pick:${requestId}`),
          inArray(productSwipes.decision, ["like", "superlike"]),
        ),
      )
      .orderBy(asc(productSwipes.seq))
  )
    .filter((swipe) => isLike(swipe.decision))
    .map((swipe) => ({
      productId: swipe.productId,
      priority: swipe.decision === "superlike" ? "top" : "normal",
      ...(swipe.variantChoice
        ? { variantChoice: swipe.variantChoice as Record<string, string> }
        : {}),
    }));

// GET /pick-requests/:id/picks — сколько друг уже выбрал по этой ссылке.
export const getMyPicks: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  return { picks: await picksOf(ctx.tx, me.id, params.id ?? "") };
};

// Цель короткой ссылки на ответ: запрос и автор ответа. Повторный ответ
// того же друга — та же ссылка, ответ в ней заменён.
const answerTarget = (requestId: string, byUserId: string) =>
  `${requestId}:${byUserId}`;

// POST /pick-requests/:id/answer → { url, code, answer }. Запроса нет на
// сервере (старая длинная ссылка-фильтр, §6.4) — ответ длинной ссылкой, как
// раньше, без записи.
export const answerPickRequest: ServerHandler = async (ctx, { params }) => {
  const requestId = params.id ?? "";
  const me = await readMe(ctx);
  if (!me.name) throw nameRequired();
  const picks = await picksOf(ctx.tx, me.id, requestId);
  if (picks.length === 0) {
    throw validation("Сначала выбери хотя бы один подарок");
  }
  const answeredAt = new Date(ctx.clock.now());
  const answer: PickAnswer = {
    requestId,
    by: personOf(me),
    picks,
    answeredAt: answeredAt.toISOString(),
  };
  const [request] = await ctx.tx
    .select({ id: pickRequests.id })
    .from(pickRequests)
    .where(eq(pickRequests.id, requestId))
    .limit(1);
  if (!request) {
    return { url: `/pick/answer/?d=${encodePickAnswer(answer)}`, answer };
  }
  await ctx.tx
    .insert(pickAnswers)
    .values({ requestId, byUserId: me.id, picks, answeredAt })
    .onConflictDoUpdate({
      target: [pickAnswers.requestId, pickAnswers.byUserId],
      set: { picks, answeredAt },
    });
  const link = await ensureShareLink(
    ctx,
    "pick_answer",
    answerTarget(requestId, me.id),
    me.id,
  );
  return { ...link, answer };
};

// POST /pick-answers — только старые длинные ссылки-ответы: разобрать.
// Запрос — только его автору (там повод и скрытие цен).
export const importPickAnswer: ServerHandler = async (ctx, { body }) => {
  const { encoded } = parseInput(PickAnswerImportSchema, body);
  const decoded = decodePickAnswer(encoded);
  if (!decoded) throw validation("Ссылка повреждена");
  const answer: PickAnswer = {
    ...decoded,
    answeredAt: new Date(ctx.clock.now()).toISOString(),
  };
  const request = await readRequest(ctx.tx, decoded.requestId);
  return {
    answer,
    request: request && request.from.userId === ctx.userId ? request : null,
  };
};

// GET /share/:code для «Выбери подарок сам» (§6.2): ссылка-фильтр — запрос
// всем; ответ — выбор всем, у кого ссылка, а запрос — только его автору.
export const pickShare = async (ctx: ServerContext, link: ShareLinkRow) => {
  if (link.kind === "pick_request") {
    const request = await readRequest(ctx.tx, link.targetId);
    return request ? { kind: "pick_request", request } : null;
  }
  const [requestId = "", byUserId = ""] = link.targetId.split(":");
  const [row] = await ctx.tx
    .select()
    .from(pickAnswers)
    .where(
      and(
        eq(pickAnswers.requestId, requestId),
        eq(pickAnswers.byUserId, byUserId),
      ),
    )
    .limit(1);
  const by = await readUser(ctx.tx, byUserId);
  if (!row || !by) return null;
  const request = await readRequest(ctx.tx, requestId);
  const answer: PickAnswer = {
    requestId,
    by: personOf(by),
    picks: row.picks as PickAnswer["picks"],
    answeredAt: row.answeredAt.toISOString(),
  };
  return {
    kind: "pick_answer",
    answer,
    request: request && request.from.userId === ctx.userId ? request : null,
  };
};
