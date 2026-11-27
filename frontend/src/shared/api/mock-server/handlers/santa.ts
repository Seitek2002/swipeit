import { drawIssueWithInvites } from "@swipeit/core/logic/draw";
import { nanoid } from "nanoid";
import { z } from "zod";

import { dative, toDateKey } from "@/shared/lib/format";
import type { BotTrigger } from "@/shared/lib/realtime/types";

import type { Product } from "../../catalog/types";
import type { PlanParticipant } from "../../plans/types";
import { drawAssignments, drawIssueOf } from "../../santa/draw";
import {
  CreateSantaInputSchema,
  type SantaGame,
  type SantaGamePublic,
  type SantaMember,
  type SantaSummary,
  type SantaTickResult,
  type SantaView,
  type SantaWard,
  type SantaWardItem,
  UpdateSantaInputSchema,
} from "../../santa/types";
import type { User } from "../../users/types";
import type { WishlistItem } from "../../wishlist/types";
import { type Handler, type HandlerContext, nowIso } from "../context";
import type { Db } from "../db";
import { ApiError, isApiError, notFound, validation } from "../errors";
import { occasionForOthers } from "../occasion";
import { parseInput, requireNamedUser, requireUser } from "./common";
import { guestItems } from "./guest";
import { itemKeyOf } from "./wishlist";

// Тайный Санта — список, создание, вступление, правка до жеребьёвки,
// жеребьёвка (вручную и по дате), конверт и «Я купил подарок» (TECH_SPEC
// §5, §6, §7; DESIGN.md §8.8). Главное правило — чужие пары не видны
// никому: в ответах только свой подопечный и счётчики.

const MAX_MEMBERS = 30;

const BoughtBodySchema = z.object({ bought: z.boolean().default(true) });

const forbidden = (message: string) => new ApiError(403, "FORBIDDEN", message);
const conflict = (message: string) => new ApiError(409, "CONFLICT", message);

const findGame = (db: Db, id: string | undefined): SantaGame => {
  const game = db.santaGames[id ?? ""];
  if (!game) throw notFound("Игра не найдена");
  return game;
};

const requireOwner = (game: SantaGame, user: User, message: string) => {
  if (game.ownerId !== user.id) throw forbidden(message);
};

const requireGathering = (game: SantaGame) => {
  if (game.status !== "gathering") {
    throw conflict("Жеребьёвка уже прошла — менять игру нельзя");
  }
};

const requireDrawnParticipant = (game: SantaGame, user: User) => {
  if (!game.participantIds.includes(user.id)) {
    throw forbidden("Ты не участвуешь в этой игре");
  }
  if (game.status !== "drawn") throw conflict("Жеребьёвки ещё не было");
};

// Как в планах: в lan все люди сервера — друзья друг другу и ботам
// (TECH_SPEC §7a), в local — только связи из db.friends.
const isFriend = (ctx: HandlerContext, db: Db, me: string, other: string) =>
  ctx.mode === "lan" || (db.friends[me] ?? []).includes(other);

const unique = (ids: string[]) => [...new Set(ids)];

// Все, кто в игре или позван: исключения можно задавать и для тех, кто
// ещё не вступил.
const membersOf = (game: SantaGame) =>
  unique([...game.participantIds, ...game.invitedIds]);

const genderOf = (user: undefined | User) =>
  user?.audience === "male" || user?.audience === "female"
    ? user.audience
    : undefined;

// «Азамату некому дарить» — имя в дательном падеже для текста ошибки.
const describeIn = (db: Db) => (id: string) => {
  const user = db.users[id];
  return user?.name ? dative(user.name, genderOf(user)) : "Кому-то";
};

const profileOf = ({
  id,
  name,
  avatarColor,
  isBot,
}: User): PlanParticipant => ({ id, name: name ?? "", avatarColor, isBot });

// «Вишлист готов» — есть хотя бы одно активное желание.
const hasWishlist = (db: Db, userId: string) =>
  (db.wishlistItems[userId] ?? []).some((item) => item.status === "active");

const memberList = (db: Db, game: SantaGame): SantaMember[] =>
  membersOf(game)
    .map((id) => db.users[id])
    .filter((user): user is User => Boolean(user))
    .map((user) => ({
      ...profileOf(user),
      hasWishlist: hasWishlist(db, user.id),
      joined: game.participantIds.includes(user.id),
    }));

// Наружу — только перечисленные поля: новое поле игры не утечёт к
// клиенту, пока его не добавят сюда явно.
const publicOf = (game: SantaGame): SantaGamePublic => ({
  id: game.id,
  title: game.title,
  ownerId: game.ownerId,
  budget: game.budget,
  exchangeDate: game.exchangeDate,
  ...(game.drawAt ? { drawAt: game.drawAt } : {}),
  status: game.status,
  participantIds: game.participantIds,
  invitedIds: game.invitedIds,
  exclusions: game.exclusions,
  ...(game.drawnAt ? { drawnAt: game.drawnAt } : {}),
  createdAt: game.createdAt,
});

const roleOf = (game: SantaGame, userId: string): SantaView["role"] => {
  if (game.ownerId === userId) return "owner";
  if (game.participantIds.includes(userId)) return "participant";
  if (game.invitedIds.includes(userId)) return "invited";
  return "guest";
};

const envelopeOf = (game: SantaGame, userId: string) =>
  game.status !== "drawn"
    ? "sealed"
    : game.openedIds.includes(userId)
      ? "opened"
      : "ready";

// Цена желания: у товара — из каталога, у своего — что указал владелец.
const priceOf = (
  item: {
    custom?: { priceMax?: number; priceMin?: number };
    productId?: string;
  },
  products: Map<string, Product>,
) => {
  const product = item.productId ? products.get(item.productId) : undefined;
  if (product) return { min: product.priceMin, max: product.priceMax };
  const min = item.custom?.priceMin ?? item.custom?.priceMax;
  const max = item.custom?.priceMax ?? item.custom?.priceMin;
  return { min: min ?? null, max: max ?? null };
};

// Желание в гостевом виде — как в GET /users/:id/wishlist: те же
// компоненты вишлиста друга показывают и вишлист подопечного.
const guestItemView = (
  item: WishlistItem,
): Omit<SantaWardItem, "overBudget" | "priceMax" | "priceMin"> => ({
  key: itemKeyOf(item),
  productId: item.source.kind === "product" ? item.source.productId : undefined,
  custom:
    item.source.kind === "custom"
      ? {
          title: item.source.custom.title,
          priceMin: item.source.custom.priceMin,
          priceMax: item.source.custom.priceMax,
          url: item.source.custom.url,
        }
      : undefined,
  priority: item.priority,
  variantChoice: item.variantChoice,
  note: item.note,
});

// Подопечный с вишлистом — только активные желания, как у гостя (T11).
const wardOf = (
  db: Db,
  game: SantaGame,
  wardId: string,
  products: Map<string, Product>,
  now: number,
): null | SantaWard => {
  const ward = db.users[wardId];
  if (!ward) return null;
  const meta = db.wishlistMeta[wardId];
  const wishlist = guestItems(db, wardId).map((source): SantaWardItem => {
    const item = guestItemView(source);
    const price = priceOf(item, products);
    return {
      ...item,
      priceMin: price.min,
      priceMax: price.max,
      overBudget: price.min !== null && price.min > game.budget,
    };
  });
  return {
    ...profileOf(ward),
    // Даты подопечного личные: Санте — только дата и готовый повод.
    // Как у гостя по ссылке: ближайшее наступление, а не сохранённая дата.
    occasion: occasionForOthers(db, wardId, now),
    message: meta?.message,
    wishlist,
    overBudgetCount: wishlist.filter((item) => item.overBudget).length,
  };
};

const drawIssue = (db: Db, game: SantaGame) =>
  game.status === "drawn"
    ? null
    : drawIssueWithInvites(
        game.participantIds,
        game.invitedIds,
        game.exclusions,
        describeIn(db),
        (id) => db.users[id]?.name ?? "кто-то",
      );

const viewOf = (
  db: Db,
  game: SantaGame,
  userId: string,
  products: Map<string, Product>,
  now: number,
): SantaView => {
  const joined = game.participantIds.includes(userId);
  const wardId = game.assignments?.[userId];
  return {
    game: publicOf(game),
    members: memberList(db, game),
    role: roleOf(game, userId),
    me: joined
      ? {
          envelope: envelopeOf(game, userId),
          bought: game.boughtIds.includes(userId),
          ward:
            game.status === "drawn" && wardId
              ? wardOf(db, game, wardId, products, now)
              : null,
        }
      : null,
    boughtCount: game.boughtIds.length,
    openedCount: game.openedIds.length,
    drawIssue: drawIssue(db, game),
  };
};

const summaryOf = (
  db: Db,
  game: SantaGame,
  userId: string,
  now: number,
): SantaSummary => {
  const view = viewOf(db, game, userId, new Map(), now);
  const wardId = game.assignments?.[userId];
  const ward = wardId ? db.users[wardId] : undefined;
  return {
    ...view,
    me: view.me
      ? {
          envelope: view.me.envelope,
          bought: view.me.bought,
          ward: view.me.envelope === "opened" && ward ? profileOf(ward) : null,
        }
      : null,
  };
};

const productMap = async (ctx: HandlerContext) =>
  new Map((await ctx.catalog.products()).map((p) => [p.id, p]));

const changed = (ctx: HandlerContext, gameId: string) =>
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["santa"],
    id: gameId,
    by: ctx.userId ?? "",
  });

// Триггер для ботов (TECH_SPEC §7): id — игра, by — кто сделал.
const trigger = (ctx: HandlerContext, name: BotTrigger, gameId: string) =>
  ctx.realtime.publish({
    type: "trigger",
    name,
    id: gameId,
    by: ctx.userId ?? "",
  });

// Даты игры по часам сервера (с перемоткой): обмен — не в прошлом,
// жеребьёвка — в будущем и не позже дня обмена.
const checkDates = (
  ctx: HandlerContext,
  exchangeDate: string,
  drawAt: string | undefined,
) => {
  const now = ctx.clock.now();
  if (exchangeDate < toDateKey(now)) {
    throw validation("Дата обмена уже прошла");
  }
  if (drawAt === undefined) return;
  const at = Date.parse(drawAt);
  if (at <= now) throw validation("Дата жеребьёвки уже прошла");
  if (toDateKey(at) > exchangeDate) {
    throw validation("Жеребьёвка должна пройти до обмена подарками");
  }
};

// Исключения: оба — в игре или позваны, не сам с собой, без повторов
// (пара [A, B] и [B, A] — одна и та же).
const normalizeExclusions = (
  game: SantaGame,
  exclusions: Array<[string, string]>,
): Array<[string, string]> => {
  const members = new Set(membersOf(game));
  const seen = new Set<string>();
  const result: Array<[string, string]> = [];
  for (const [a, b] of exclusions) {
    if (a === b) throw validation("Человек и так не дарит сам себе");
    if (!members.has(a) || !members.has(b)) {
      throw validation("В исключениях — тот, кого нет в игре");
    }
    const key = a < b ? `${a}\n${b}` : `${b}\n${a}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push([a, b]);
  }
  return result;
};

// Невозможные исключения — ошибка сразу, до жеребьёвки (TASKS T17): по
// всем, кто в игре или позван. Если вступят не все, жеребьёвка проверит
// ещё раз по тем, кто вступил.
const checkExclusionsPossible = (db: Db, game: SantaGame) => {
  const members = membersOf(game);
  if (members.length < 3) return;
  const issue = drawIssueOf(members, game.exclusions, describeIn(db));
  if (issue) throw conflict(issue);
};

// GET /santa — мои игры (участвую или позван), новые сверху.
export const listSantaGames: Handler = async (ctx) => {
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  // reverse — при равном времени новее та, что добавлена позже; sort
  // стабильный.
  return Object.values(db.santaGames)
    .reverse()
    .filter((game) => membersOf(game).includes(user.id))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map((game) => summaryOf(db, game, user.id, ctx.clock.now()));
};

// GET /santa/:id — игра глазами пользователя запроса. Открыть может любой:
// экран приглашения /santa/join/?id= показывает игру до вступления. Своя
// пара — только участнику; «Смотреть как» работает, потому что меняет
// пользователя запроса.
export const getSantaGame: Handler = async (ctx, { params }) => {
  const products = await productMap(ctx);
  const db = await ctx.db.read();
  const user = requireUser(ctx, db);
  return viewOf(
    db,
    findGame(db, params.id),
    user.id,
    products,
    ctx.clock.now(),
  );
};

// POST /santa — новая игра. Организатор вступил сразу, друзья — «позваны»:
// боты вступают сами через 2–10 с (santa:created), люди — по кнопке или
// ссылке.
export const createSantaGame: Handler = async (ctx, { body }) => {
  const input = parseInput(CreateSantaInputSchema, body);
  const drawAt = input.drawMode === "date" ? input.drawAt : undefined;
  checkDates(ctx, input.exchangeDate, drawAt);
  const products = await productMap(ctx);
  const view = await ctx.db.write((db): SantaView => {
    // Имя участника — на конверте Санты: без него игру не начать.
    const owner = requireNamedUser(ctx, db);
    const invited = unique(input.participantIds).filter(
      (id) => id !== owner.id,
    );
    for (const id of invited) {
      // Безымянного никто не узнает — в списке друзей его нет (§7a).
      const friend = db.users[id];
      if (!friend || !friend.name) throw validation("Такого друга нет");
      if (!isFriend(ctx, db, owner.id, id)) {
        throw validation(
          "Позвать можно только друзей — остальным отправь ссылку",
        );
      }
    }
    const game: SantaGame = {
      id: `sg_${nanoid(10)}`,
      title: input.title,
      ownerId: owner.id,
      budget: input.budget,
      exchangeDate: input.exchangeDate,
      ...(drawAt ? { drawAt } : {}),
      status: "gathering",
      participantIds: [owner.id],
      invitedIds: invited,
      exclusions: [],
      openedIds: [],
      boughtIds: [],
      createdAt: nowIso(ctx.clock),
    };
    game.exclusions = normalizeExclusions(game, input.exclusions);
    checkExclusionsPossible(db, game);
    db.santaGames[game.id] = game;
    return viewOf(db, game, owner.id, products, ctx.clock.now());
  });
  changed(ctx, view.game.id);
  trigger(ctx, "santa:created", view.game.id);
  return view;
};

// PATCH /santa/:id — название, бюджет, даты, исключения: только
// организатор и только до жеребьёвки (TECH_SPEC §6).
export const updateSantaGame: Handler = async (ctx, { params, body }) => {
  const patch = parseInput(UpdateSantaInputSchema, body);
  const products = await productMap(ctx);
  const view = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const game = findGame(db, params.id);
    requireOwner(game, user, "Менять игру может только организатор");
    requireGathering(game);
    if (patch.title !== undefined) game.title = patch.title;
    if (patch.budget !== undefined) game.budget = patch.budget;
    const exchangeDate = patch.exchangeDate ?? game.exchangeDate;
    let drawAt = game.drawAt;
    if (patch.drawMode === "manual") drawAt = undefined;
    else if (patch.drawAt !== undefined) drawAt = patch.drawAt;
    // Даты проверяем, только если их меняли: старая дата жеребьёвки могла
    // пройти, пока игра ждала (тогда её проведёт планировщик).
    if (
      patch.exchangeDate !== undefined ||
      patch.drawAt !== undefined ||
      patch.drawMode !== undefined
    ) {
      checkDates(ctx, exchangeDate, drawAt);
    }
    game.exchangeDate = exchangeDate;
    if (drawAt) game.drawAt = drawAt;
    else delete game.drawAt;
    if (patch.exclusions !== undefined) {
      game.exclusions = normalizeExclusions(game, patch.exclusions);
      checkExclusionsPossible(db, game);
    }
    return viewOf(db, game, user.id, products, ctx.clock.now());
  });
  changed(ctx, view.game.id);
  return view;
};

// POST /santa/:id/join — вступить: позванный по кнопке или кто угодно по
// ссылке /santa/join/?id= (TECH_SPEC §8). Только до жеребьёвки. Повторное
// вступление ничего не меняет.
export const joinSantaGame: Handler = async (ctx, { params }) => {
  const products = await productMap(ctx);
  const { joined, view } = await ctx.db.write((db) => {
    // Сначала — есть ли игра: на битую ссылку имя спрашивать незачем.
    const game = findGame(db, params.id);
    const user = requireNamedUser(ctx, db);
    const already = game.participantIds.includes(user.id);
    if (!already) {
      if (game.status !== "gathering") {
        throw conflict("Жеребьёвка уже прошла — вступить нельзя");
      }
      if (game.participantIds.length >= MAX_MEMBERS) {
        throw conflict("В игре уже 30 человек — больше нельзя");
      }
      game.participantIds.push(user.id);
      game.invitedIds = game.invitedIds.filter((id) => id !== user.id);
    }
    return {
      joined: !already,
      view: viewOf(db, game, user.id, products, ctx.clock.now()),
    };
  });
  if (joined) changed(ctx, view.game.id);
  return view;
};

// Сама жеребьёвка — общая для кнопки организатора и планировщика. Пары —
// только среди вступивших; кто так и не вступил, из игры выбывает.
const performDraw = (ctx: HandlerContext, db: Db, game: SantaGame) => {
  game.assignments = drawAssignments(
    game.participantIds,
    game.exclusions,
    ctx.random,
    describeIn(db),
  );
  game.status = "drawn";
  game.drawnAt = nowIso(ctx.clock);
  game.invitedIds = [];
};

// POST /santa/:id/draw — «Провести жеребьёвку»: только организатор
// (TECH_SPEC §6). Невозможно (меньше 3, исключения) — CONFLICT с текстом
// для экрана, игра не меняется.
export const drawSantaGame: Handler = async (ctx, { params }) => {
  const products = await productMap(ctx);
  const view = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const game = findGame(db, params.id);
    requireOwner(game, user, "Жеребьёвку проводит организатор");
    requireGathering(game);
    performDraw(ctx, db, game);
    return viewOf(db, game, user.id, products, ctx.clock.now());
  });
  changed(ctx, view.game.id);
  trigger(ctx, "santa:drawn", view.game.id);
  return view;
};

// POST /santa/:id/open — вскрыл конверт. Состояние opened сохраняется:
// второй раз конверт уже открыт. Повторный вызов ничего не меняет.
export const openSantaEnvelope: Handler = async (ctx, { params }) => {
  const products = await productMap(ctx);
  const { opened, view } = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const game = findGame(db, params.id);
    requireDrawnParticipant(game, user);
    const already = game.openedIds.includes(user.id);
    if (!already) game.openedIds.push(user.id);
    return {
      opened: !already,
      view: viewOf(db, game, user.id, products, ctx.clock.now()),
    };
  });
  if (opened) changed(ctx, view.game.id);
  return view;
};

// POST /santa/:id/bought { bought?: boolean } — «Я купил подарок» (и снять
// отметку). Сначала — вскрыть конверт: покупать, не зная кому, нечего.
export const setSantaBought: Handler = async (ctx, { params, body }) => {
  const { bought } = parseInput(BoughtBodySchema, body ?? {});
  const products = await productMap(ctx);
  const { changedNow, view } = await ctx.db.write((db) => {
    const user = requireUser(ctx, db);
    const game = findGame(db, params.id);
    requireDrawnParticipant(game, user);
    if (!game.openedIds.includes(user.id)) {
      throw conflict("Сначала открой конверт");
    }
    const was = game.boughtIds.includes(user.id);
    const others = game.boughtIds.filter((id) => id !== user.id);
    game.boughtIds = bought ? [...others, user.id] : others;
    return {
      changedNow: was !== bought,
      view: viewOf(db, game, user.id, products, ctx.clock.now()),
    };
  });
  if (changedNow) changed(ctx, view.game.id);
  return view;
};

// ── Жеребьёвка по дате ──────────────────────────────────────────────

const isDue = (game: SantaGame, now: number) =>
  game.status === "gathering" &&
  game.drawAt !== undefined &&
  Date.parse(game.drawAt) <= now;

// Планировщик (TECH_SPEC §7 «Часы»): игры, у которых наступил drawAt по
// ctx.clock (с перемоткой), — жеребьёвка. Сначала чтение: зовётся каждые
// 15 с из каждой вкладки, и пустой проход не должен ничего записывать.
export const drawDueSantaGames = async (
  ctx: HandlerContext,
): Promise<SantaTickResult> => {
  const now = ctx.clock.now();
  const current = await ctx.db.read();
  if (!Object.values(current.santaGames).some((game) => isDue(game, now))) {
    return { drawn: [], failed: [] };
  }
  const result = await ctx.db.write((db): SantaTickResult => {
    const drawn: string[] = [];
    const failed: SantaTickResult["failed"] = [];
    for (const game of Object.values(db.santaGames)) {
      if (!isDue(game, now)) continue;
      // Пробуем на копии: неудачная жеребьёвка не должна оставить в игре
      // половину изменений.
      const draft = structuredClone(game);
      try {
        performDraw(ctx, db, draft);
      } catch (error) {
        if (!isApiError(error)) throw error;
        failed.push({ id: game.id, reason: error.message });
        continue;
      }
      db.santaGames[game.id] = draft;
      drawn.push(game.id);
    }
    return { drawn, failed };
  });
  for (const id of result.drawn) {
    changed(ctx, id);
    trigger(ctx, "santa:drawn", id);
  }
  return result;
};

// POST /santa/tick — тот же проход по запросу. Расширение TECH_SPEC §6, по
// образцу POST /plans/expire: клиентский планировщик зовёт его раз в 15 с
// и при возвращении во вкладку, LAN-сервер — сам по таймеру. Пользователь
// не нужен: правило зависит только от часов.
export const tickSanta: Handler = async (ctx) => drawDueSantaGames(ctx);
