import type { PlanParticipant } from "@swipeit/core/api/plans/types";
import {
  CreateSantaInputSchema,
  HandOverSantaInputSchema,
  type SantaMember,
  type SantaSummary,
  type SantaTickResult,
  type SantaView,
  type SantaWard,
  type SantaWardItem,
  type UpdateSantaInput,
  UpdateSantaInputSchema,
} from "@swipeit/core/api/santa/types";
import type { User } from "@swipeit/core/api/users/types";
import type { WishlistItem } from "@swipeit/core/api/wishlist/types";
import {
  conflict,
  forbidden,
  isApiError,
  nameRequired,
  notFound,
  validation,
} from "@swipeit/core/errors";
import { dative, hasNamesakes, toDateKey } from "@swipeit/core/format";
import {
  drawAssignments,
  drawIssueOf,
  drawIssueWithInvites,
} from "@swipeit/core/logic/draw";
import { occasionForOthersFrom } from "@swipeit/core/logic/occasion";
import {
  countInSantaBudget,
  SANTA_WISHES_ENOUGH,
} from "@swipeit/core/logic/santa-wishlist";
import {
  AFTER_DRAW_PATCH_MESSAGE,
  lockedAfterDraw,
  newOwnerText,
  termsChangedText,
} from "@swipeit/core/logic/santa-update";
import { parseInput } from "@swipeit/core/parse-input";
import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
} from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";

import {
  nowIso,
  type ServerContext,
  type ServerHandler,
  type Tx,
} from "../../context";
import { reservations, santaGames, santaMembers, users } from "../../db/schema";
import { datesOf } from "../dates/handlers";
import { areFriends, makeFriends } from "../friends/handlers";
import { countEvent, reachStep } from "../funnel/steps";
import { guestItemsOf } from "../guest/handlers";
import {
  notifySantaDrawFailed,
  notifySantaDrawn,
} from "../notifications/events";
import { readMe, readUser, type UserRow } from "../users/queries";
import { itemKeyOf, readMeta, rowToMeta } from "../wishlist/queries";
import { repairAfterRemoval } from "./repair";
import {
  insertGame,
  loadGame,
  saveAssignments,
  saveGame,
  type StoredGame,
  wardIdOf,
} from "./store";

// Тайный Санта на сервере (BACKEND.md B11) — те же правила, что у мока
// (frontend/src/shared/api/mock-server/handlers/santa.ts). Главное — чужие
// пары не видны никому (§4.6, п. 2): в загруженной игре пар нет вовсе,
// своего подопечного читает только wardIdOf. Каждая запись — под FOR UPDATE
// строки игры: двое, одновременно нажавшие «Провести жеребьёвку», получат
// одну жеребьёвку и CONFLICT.

const MAX_MEMBERS = 30;

// itemKey — что купил (X02): бронь желания подопечного.
const BoughtBodySchema = z.object({
  bought: z.boolean().default(true),
  itemKey: z.string().min(1).max(200).optional(),
});

const unique = (ids: readonly string[]) => [...new Set(ids)];

const membersOf = (game: StoredGame) =>
  unique([...game.participantIds, ...game.invitedIds]);

const requireOwner = (game: StoredGame, user: UserRow, message: string) => {
  if (game.ownerId !== user.id) throw forbidden(message);
};

const requireGathering = (game: StoredGame) => {
  if (game.status !== "gathering") {
    throw conflict("Жеребьёвка уже прошла — менять игру нельзя");
  }
};

const requireDrawnParticipant = (game: StoredGame, user: UserRow) => {
  if (!game.participantIds.includes(user.id)) {
    throw forbidden("Ты не участвуешь в этой игре");
  }
  if (game.status !== "drawn") throw conflict("Жеребьёвки ещё не было");
};

// Участник глазами игры: имя, цвет и пол (для дательного падежа в тексте).
type Person = {
  audience: string;
  avatarColor: string;
  id: string;
  name: null | string;
};

const readPeople = async (
  tx: Tx,
  ids: readonly string[],
): Promise<Map<string, Person>> => {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({
      id: users.id,
      name: users.name,
      avatarColor: users.avatarColor,
      audience: users.audience,
    })
    .from(users)
    .where(inArray(users.id, [...ids]));
  return new Map(rows.map((row) => [row.id, row]));
};

const profileOf = (person: Person): PlanParticipant => ({
  id: person.id,
  name: person.name ?? "",
  avatarColor: person.avatarColor as User["avatarColor"],
  // Ботов на сервере нет (§7).
  isBot: false,
});

const genderOf = (person: Person | undefined) =>
  person?.audience === "male" || person?.audience === "female"
    ? person.audience
    : undefined;

// «Азамату некому дарить» — имя в дательном падеже для текста ошибки.
const describeIn = (people: Map<string, Person>) => (id: string) => {
  const person = people.get(id);
  return person?.name ? dative(person.name, genderOf(person)) : "Кому-то";
};

// Исключения — только организатору (S05): участнику, позванному и гостю
// по ссылке они рассказали бы о людях и сузили бы, кто твой Санта.
const publicOf = (
  game: StoredGame,
  role: SantaView["role"],
): SantaView["game"] => ({
  id: game.id,
  title: game.title,
  ownerId: game.ownerId,
  budget: game.budget,
  exchangeDate: game.exchangeDate,
  ...(game.drawAt ? { drawAt: game.drawAt } : {}),
  status: game.status,
  participantIds: game.participantIds,
  invitedIds: game.invitedIds,
  exclusions: role === "owner" ? game.exclusions : [],
  ...(game.drawnAt ? { drawnAt: game.drawnAt } : {}),
  createdAt: game.createdAt,
});

const roleOf = (game: StoredGame, userId: string): SantaView["role"] => {
  if (game.ownerId === userId) return "owner";
  if (game.participantIds.includes(userId)) return "participant";
  if (game.invitedIds.includes(userId)) return "invited";
  return "guest";
};

const envelopeOf = (game: StoredGame, userId: string) =>
  game.status !== "drawn"
    ? "sealed"
    : game.openedIds.includes(userId)
      ? "opened"
      : "ready";

// Цена желания: у товара — из каталога, у своего — что указал владелец.
const priceOf = (ctx: ServerContext, item: WishlistItem) => {
  if (item.source.kind === "product") {
    const product = ctx.catalog.productsById.get(item.source.productId);
    if (product) return { min: product.priceMin, max: product.priceMax };
    return { min: null, max: null };
  }
  const { priceMin, priceMax } = item.source.custom;
  return {
    min: priceMin ?? priceMax ?? null,
    max: priceMax ?? priceMin ?? null,
  };
};

// Сколько желаний человека в бюджете игры (по нижней цене, core
// santa-wishlist). Тот же счёт — у строки участника и подтверждения
// жеребьёвки (Z03), у ward_empty и у напоминания «Добавь пару желаний» (S10).
const inBudgetOf = (
  ctx: ServerContext,
  items: readonly WishlistItem[],
  budget: number,
) =>
  countInSantaBudget(
    items.map((item) => priceOf(ctx, item).min),
    budget,
  );

export const wishesInBudget = async (
  ctx: ServerContext,
  userId: string,
  budget: number,
) => inBudgetOf(ctx, await guestItemsOf(ctx.tx, userId), budget);

// Подопечный с вишлистом — активные желания, как у гостя (T11).
const wardOf = async (
  ctx: ServerContext,
  game: StoredGame,
  wardId: string,
  santaId: string,
): Promise<null | SantaWard> => {
  const ward = (await readPeople(ctx.tx, [wardId])).get(wardId);
  if (!ward) return null;
  const meta = rowToMeta(wardId, await readMeta(ctx.tx, wardId));
  const occasion = occasionForOthersFrom(
    await datesOf(ctx.tx, wardId),
    meta.occasion,
    ctx.clock.now(),
  );
  // Открытые брони на вишлист подопечного (X02): ключ → кто бронировал.
  const reservers = new Map(
    (
      await ctx.tx
        .select({ itemKey: reservations.itemKey, by: reservations.reserverId })
        .from(reservations)
        .where(
          and(eq(reservations.ownerRef, wardId), isNull(reservations.closedAt)),
        )
    ).map((row) => [row.itemKey, row.by]),
  );
  const wishlist = (await guestItemsOf(ctx.tx, wardId)).map(
    (item): SantaWardItem => {
      const price = priceOf(ctx, item);
      const reserver = reservers.get(itemKeyOf(item));
      return {
        ...(reserver === santaId ? { reservedByMe: true } : {}),
        ...(reserver && reserver !== santaId ? { reserved: true } : {}),
        key: itemKeyOf(item),
        ...(item.source.kind === "product"
          ? { productId: item.source.productId }
          : {
              custom: {
                title: item.source.custom.title,
                priceMin: item.source.custom.priceMin,
                priceMax: item.source.custom.priceMax,
                url: item.source.custom.url,
              },
            }),
        priority: item.priority,
        ...(item.variantChoice ? { variantChoice: item.variantChoice } : {}),
        ...(item.note ? { note: item.note } : {}),
        priceMin: price.min,
        priceMax: price.max,
        overBudget: price.min !== null && price.min > game.budget,
      };
    },
  );
  return {
    ...profileOf(ward),
    ...(occasion ? { occasion } : {}),
    ...(meta.message ? { message: meta.message } : {}),
    // Уже выбранное друзьями — вниз (X02).
    wishlist: wishlist.sort(
      (a, b) => Number(Boolean(a.reserved)) - Number(Boolean(b.reserved)),
    ),
    overBudgetCount: wishlist.filter((item) => item.overBudget).length,
  };
};

// Гостю (превью по ссылке, X07) — только профиль и joined (S05): готов ли
// чей-то вишлист и кто вскрыл письмо, знать ему незачем.
// Организатор — первым, остальные по порядку вступления: после «Передать
// роль» (S04) он может быть не первым вступившим.
const ownerFirst = (game: StoredGame) => [
  ...membersOf(game).filter((id) => id === game.ownerId),
  ...membersOf(game).filter((id) => id !== game.ownerId),
];

const memberList = async (
  ctx: ServerContext,
  game: StoredGame,
  people: Map<string, Person>,
  role: SantaView["role"],
): Promise<SantaMember[]> => {
  const result: SantaMember[] = [];
  for (const id of ownerFirst(game)) {
    const person = people.get(id);
    if (!person) continue;
    const joined = game.participantIds.includes(id);
    if (role === "guest") {
      result.push({ ...profileOf(person), joined });
      continue;
    }
    // Активные желания без повторов — как у гостя и в письме Санты.
    const wishes = await guestItemsOf(ctx.tx, id);
    result.push({
      ...profileOf(person),
      hasWishlist: wishes.length > 0,
      joined,
      opened: game.openedIds.includes(id),
      wishesInBudget: inBudgetOf(ctx, wishes, game.budget),
    });
  }
  return result;
};

const drawIssue = (game: StoredGame, people: Map<string, Person>) =>
  game.status === "drawn"
    ? null
    : drawIssueWithInvites(
        game.participantIds,
        game.invitedIds,
        game.exclusions,
        describeIn(people),
        (id) => people.get(id)?.name ?? "кто-то",
      );

// Игра глазами userId. Подопечный — только свой: wardIdOf(santa = userId).
const viewOf = async (
  ctx: ServerContext,
  game: StoredGame,
  userId: string,
  { withWard }: { withWard: boolean } = { withWard: true },
): Promise<SantaView> => {
  const people = await readPeople(ctx.tx, membersOf(game));
  const joined = game.participantIds.includes(userId);
  const role = roleOf(game, userId);
  // Причина неудачи и drawIssue называют людей из исключений — только
  // организатору (S05). Отметку «не прошла» видят все.
  const owner = role === "owner";
  const wardId =
    joined && game.status === "drawn"
      ? await wardIdOf(ctx.tx, game.id, userId)
      : null;
  return {
    game: publicOf(game, role),
    members: await memberList(ctx, game, people, role),
    role,
    me: joined
      ? {
          envelope: envelopeOf(game, userId),
          bought: game.boughtIds.includes(userId),
          ward:
            withWard && wardId ? await wardOf(ctx, game, wardId, userId) : null,
          // Жеребьёвка была, а пары нет — подопечный удалил профиль (Q05).
          ...(game.status === "drawn" && !wardId ? { wardLeft: true } : {}),
        }
      : null,
    boughtCount: game.boughtIds.length,
    openedCount: game.openedIds.length,
    // Убрали меня (Z01) — только мне.
    ...(game.removedIds.includes(userId) ? { removed: true } : {}),
    drawIssue: owner ? drawIssue(game, people) : null,
    drawFailed: game.drawFailed
      ? owner
        ? game.drawFailed
        : { at: game.drawFailed.at }
      : null,
  };
};

// Карточка в списке: подопечный — только после вскрытия, без вишлиста.
const summaryOf = async (
  ctx: ServerContext,
  game: StoredGame,
  userId: string,
): Promise<SantaSummary> => {
  const view = await viewOf(ctx, game, userId, { withWard: false });
  if (!view.me) return { ...view, me: null };
  const wardId =
    view.me.envelope === "opened"
      ? await wardIdOf(ctx.tx, game.id, userId)
      : null;
  const ward = wardId ? (await readPeople(ctx.tx, [wardId])).get(wardId) : null;
  return {
    ...view,
    me: {
      envelope: view.me.envelope,
      bought: view.me.bought,
      ward: ward ? profileOf(ward) : null,
    },
  };
};

// Без by: по «кто сделал» другие узнали бы, кто вскрыл конверт или купил
// подарок, а видны только счётчики (§4.6, п. 2; §5).
// Вступившим и позванным, плюс тому, кто сделал, и, если есть, убранному
// (§5).
const changed = (
  ctx: ServerContext,
  game: StoredGame,
  extra: readonly string[] = [],
) =>
  ctx.events.publish({ type: "db:changed", scope: ["santa"], id: game.id }, [
    ...game.participantIds,
    ...game.invitedIds,
    ctx.userId ?? "",
    ...extra,
  ]);

const readNamedMe = async (ctx: ServerContext): Promise<UserRow> => {
  const me = await readMe(ctx);
  if (!me.name) throw nameRequired();
  return me;
};

// Даты игры по часам сервера: обмен — не в прошлом, жеребьёвка — в
// будущем и не позже дня обмена.
const checkDates = (
  ctx: ServerContext,
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

const normalizeExclusions = (
  game: StoredGame,
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

// Невозможные исключения — ошибка сразу, до жеребьёвки (T17).
const checkExclusionsPossible = async (tx: Tx, game: StoredGame) => {
  const members = membersOf(game);
  if (members.length < 3) return;
  const people = await readPeople(tx, members);
  const issue = drawIssueOf(members, game.exclusions, describeIn(people));
  if (issue) throw conflict(issue);
};

// Действие под блокировкой строки игры: изменить копию, записать разницу.
const withGame = async <T>(
  ctx: ServerContext,
  id: string,
  mutate: (game: StoredGame) => Promise<T> | T,
): Promise<{ game: StoredGame; result: T }> => {
  const before = await loadGame(ctx.tx, id, { lock: true });
  const game = structuredClone(before);
  const result = await mutate(game);
  await saveGame(ctx.tx, before, game, ctx.clock.now());
  return { game, result };
};

// ── Маршруты ────────────────────────────────────────────────────────

// GET /santa — мои игры (участвую или позван), новые сверху.
export const listSantaGames: ServerHandler = async (ctx) => {
  const me = await readMe(ctx);
  const rows = await ctx.tx
    .select({ id: santaGames.id })
    .from(santaGames)
    .innerJoin(
      santaMembers,
      and(
        eq(santaMembers.gameId, santaGames.id),
        eq(santaMembers.userId, me.id),
      ),
    )
    .orderBy(desc(santaGames.createdAt), desc(santaGames.seq));
  const result: SantaSummary[] = [];
  for (const { id } of rows) {
    result.push(
      await summaryOf(ctx, await loadGame(ctx.tx, id, { lock: false }), me.id),
    );
  }
  return result;
};

// GET /santa/:id — игра глазами того, кто спрашивает. Открыть может любой
// (экран приглашения); своя пара — только участнику.
export const getSantaGame: ServerHandler = async (ctx, { params }) => {
  // Без профиля — гость по приглашению (X07): роль guest, «моего» нет.
  const me = ctx.userId ? await readMe(ctx) : null;
  return viewOf(
    ctx,
    await loadGame(ctx.tx, params.id ?? "", { lock: false }),
    me?.id ?? "",
  );
};

// POST /santa — организатор вступил сразу, друзья — «позваны».
export const createSantaGame: ServerHandler = async (ctx, { body }) => {
  const input = parseInput(CreateSantaInputSchema, body);
  const drawAt = input.drawMode === "date" ? input.drawAt : undefined;
  checkDates(ctx, input.exchangeDate, drawAt);
  // Имя участника — на конверте Санты: без него игру не начать.
  const owner = await readNamedMe(ctx);
  const invited = unique(input.participantIds).filter((id) => id !== owner.id);
  for (const id of invited) {
    const friend = await readUser(ctx.tx, id);
    if (!friend?.name) throw validation("Такого друга нет");
    if (!(await areFriends(ctx.tx, owner.id, id))) {
      throw validation(
        "Позвать можно только друзей — остальным отправь ссылку",
      );
    }
  }
  const game: StoredGame = {
    id: `sg_${nanoid(10)}`,
    title: input.title,
    ownerId: owner.id,
    budget: input.budget,
    exchangeDate: input.exchangeDate,
    ...(drawAt ? { drawAt: new Date(drawAt).toISOString() } : {}),
    status: "gathering",
    participantIds: [owner.id],
    invitedIds: invited,
    exclusions: [],
    openedIds: [],
    boughtIds: [],
    removedIds: [],
    createdAt: nowIso(ctx.clock),
  };
  game.exclusions = normalizeExclusions(game, input.exclusions);
  await checkExclusionsPossible(ctx.tx, game);
  await insertGame(ctx.tx, game, ctx.clock.now());
  await reachStep(ctx.tx, owner.id, "santa_created", ctx.clock.now());
  changed(ctx, game);
  return viewOf(ctx, game, owner.id);
};

// PATCH /santa/:id — только организатор. До жеребьёвки — всё, после —
// только дата обмена (R03: праздник перенесли). Бюджет или дата обмена
// поменялись — участникам тост, организатору — нет.
export const updateSantaGame: ServerHandler = async (ctx, { params, body }) => {
  const patch = parseInput(UpdateSantaInputSchema, body);
  const me = await readMe(ctx);
  const { game, result: notice } = await withGame(
    ctx,
    params.id ?? "",
    async (game) => {
      requireOwner(game, me, "Менять игру может только организатор");
      const before = { ...game };
      if (game.status === "drawn") {
        if (lockedAfterDraw(patch)) throw conflict(AFTER_DRAW_PATCH_MESSAGE);
        if (patch.exchangeDate !== undefined) {
          checkDates(ctx, patch.exchangeDate, undefined);
          game.exchangeDate = patch.exchangeDate;
        }
        return termsChangedText(before, game);
      }
      await updateGathering(ctx, game, patch);
      return termsChangedText(before, game);
    },
  );
  changed(ctx, game);
  if (notice) {
    const others = game.participantIds.filter((id) => id !== game.ownerId);
    for (const forUserId of others) {
      ctx.events.publish({ type: "toast", text: notice, forUserId }, [
        forUserId,
      ]);
    }
  }
  return viewOf(ctx, game, me.id);
};

// Правка до жеребьёвки: любые поля, даты и исключения — с проверкой.
const updateGathering = async (
  ctx: ServerContext,
  game: StoredGame,
  patch: UpdateSantaInput,
) => {
  clearDrawFailed(game);
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
  if (drawAt) game.drawAt = new Date(drawAt).toISOString();
  else delete game.drawAt;
  if (patch.exclusions !== undefined) {
    game.exclusions = normalizeExclusions(game, patch.exclusions);
    await checkExclusionsPossible(ctx.tx, game);
  }
};

// POST /santa/:id/join — позванный по кнопке или кто угодно по ссылке.
// Только до жеребьёвки и не больше 30 человек — под блокировкой строки игры.
export const joinSantaGame: ServerHandler = async (ctx, { params }) => {
  // Сначала — есть ли игра: на битую ссылку имя спрашивать незачем.
  await loadGame(ctx.tx, params.id ?? "", { lock: false });
  const me = await readNamedMe(ctx);
  const { game, result: joined } = await withGame(
    ctx,
    params.id ?? "",
    (game) => {
      if (game.participantIds.includes(me.id)) return false;
      if (game.status !== "gathering") {
        throw conflict("Жеребьёвка уже прошла — вступить нельзя");
      }
      if (game.removedIds.includes(me.id)) {
        throw conflict("Организатор убрал тебя из этой игры");
      }
      if (game.participantIds.length >= MAX_MEMBERS) {
        throw conflict("В игре уже 30 человек — больше нельзя");
      }
      game.participantIds.push(me.id);
      game.invitedIds = game.invitedIds.filter((id) => id !== me.id);
      clearDrawFailed(game);
      return true;
    },
  );
  if (joined) {
    // Вступивший — друг организатору, не всем участникам (§4.3, п. 1).
    await makeFriends(ctx.tx, game.ownerId, me.id, "santa", ctx.clock);
    await reachStep(ctx.tx, me.id, "santa_joined", ctx.clock.now());
    changed(ctx, game);
  }
  return viewOf(ctx, game, me.id);
};

// Убрать человека до жеребьёвки (Q05): из вступивших, позванных и
// исключений. Невозможные после этого исключения игру не блокируют —
// drawIssue объяснит, что не так.
const dropMember = (game: StoredGame, userId: string) => {
  game.participantIds = game.participantIds.filter((id) => id !== userId);
  game.invitedIds = game.invitedIds.filter((id) => id !== userId);
  game.exclusions = game.exclusions.filter(
    ([a, b]) => a !== userId && b !== userId,
  );
};

// POST /santa/:id/leave — «Выйти из игры»: как в моке.
export const leaveSantaGame: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const { game, result: didChange } = await withGame(
    ctx,
    params.id ?? "",
    (game) => {
      if (!membersOf(game).includes(me.id)) return false;
      if (game.ownerId === me.id) {
        throw forbidden("Организатор не может выйти из игры");
      }
      if (game.status !== "gathering") {
        throw conflict("Жеребьёвка уже прошла — выйти нельзя");
      }
      dropMember(game, me.id);
      clearDrawFailed(game);
      return true;
    },
  );
  if (didChange) changed(ctx, game);
  return viewOf(ctx, game, me.id);
};

// DELETE /santa/:id/members/:userId — «Убрать из игры»: как в моке.
export const removeSantaMember: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const target = params.userId ?? "";
  const { game: changedGame, result: afterDraw } = await withGame(
    ctx,
    params.id ?? "",
    (game) => {
      requireOwner(game, me, "Убрать участника может только организатор");
      if (target === game.ownerId) throw validation("Себя убрать нельзя");
      if (!membersOf(game).includes(target)) {
        throw notFound("Такого участника нет");
      }
      // После жеребьёвки (R05): отпуск, болезнь — пары чинятся, как при
      // удалении профиля. Меньше троих — игру проще провести заново.
      const drawn = game.status === "drawn";
      if (drawn && game.participantIds.length - 1 < 3) {
        throw conflict("Останется меньше троих — проще провести игру заново");
      }
      dropMember(game, target);
      game.openedIds = game.openedIds.filter((id) => id !== target);
      game.boughtIds = game.boughtIds.filter((id) => id !== target);
      game.removedIds = unique([...game.removedIds, target]);
      clearDrawFailed(game);
      return drawn;
    },
  );
  let game = changedGame;
  if (afterDraw) {
    await repairAfterRemoval(ctx, game.id, target);
    await countEvent(
      ctx.tx,
      "santa_removed_after_draw",
      ctx.clock.now(),
      me.id,
    );
    ctx.events.publish(
      {
        type: "toast",
        text: `Организатор убрал тебя из игры «${game.title}»`,
        forUserId: target,
      },
      [target],
    );
    // Письмо Санты ушедшего снова запечатано — перечитываем игру.
    game = await loadGame(ctx.tx, game.id, { lock: false });
  }
  changed(ctx, game, [target]);
  return viewOf(ctx, game, me.id);
};

// POST /santa/:id/owner { userId } — «Передать роль организатора» (S04): как
// в моке. Под блокировкой строки игры: меняется только owner_id, пары
// (santa_assignments) не трогаются и новому организатору не видны — роль
// даёт вести игру, а не читать чужие письма.
export const handOverSantaGame: ServerHandler = async (
  ctx,
  { params, body },
) => {
  const { userId: target } = parseInput(HandOverSantaInputSchema, body ?? {});
  const me = await readMe(ctx);
  const { game } = await withGame(ctx, params.id ?? "", (game) => {
    requireOwner(game, me, "Передать игру может только организатор");
    if (target === me.id) throw validation("Ты уже организатор этой игры");
    if (!game.participantIds.includes(target)) {
      throw validation("Передать игру можно только тому, кто в ней");
    }
    game.ownerId = target;
  });
  changed(ctx, game);
  ctx.events.publish(
    { type: "toast", text: newOwnerText(game.title), forUserId: target },
    [target],
  );
  return viewOf(ctx, game, me.id);
};

// Тёзки среди вступивших (R04): как часто жеребьёвка идёт с возможным
// двойником — одним человеком с двух телефонов.
const countNamesakes = async (
  ctx: ServerContext,
  game: StoredGame,
  now: number,
  initiatorId: string,
) => {
  const people = await readPeople(ctx.tx, game.participantIds);
  const names = game.participantIds.map((id) => people.get(id)?.name ?? "");
  if (hasNamesakes(names)) {
    await countEvent(ctx.tx, "santa_drawn_with_namesakes", now, initiatorId);
  }
};

// Жеребьёвка — общая для кнопки и планировщика. Пары — среди вступивших;
// кто так и не вступил, выбывает.
const performDraw = async (ctx: ServerContext, game: StoredGame) => {
  const people = await readPeople(ctx.tx, game.participantIds);
  const assignments = drawAssignments(
    game.participantIds,
    game.exclusions,
    ctx.random,
    describeIn(people),
  );
  game.status = "drawn";
  game.drawnAt = nowIso(ctx.clock);
  game.invitedIds = [];
  // Провели вручную после неудачи по дате — отметка больше не нужна (R08).
  clearDrawFailed(game);
  return assignments;
};

// POST /santa/:id/draw — «Провести жеребьёвку»: только организатор.
export const drawSantaGame: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const { game, result: assignments } = await withGame(
    ctx,
    params.id ?? "",
    async (game) => {
      requireOwner(game, me, "Жеребьёвку проводит организатор");
      requireGathering(game);
      return performDraw(ctx, game);
    },
  );
  await saveAssignments(ctx.tx, game.id, assignments);
  await notifySantaDrawn(ctx.tx, game, ctx.clock.now());
  // Компания разыграла Санту (Q02): по игре, жеребьёвка бывает одна.
  await countEvent(ctx.tx, "santa_drawn_group", ctx.clock.now(), me.id);
  await countNamesakes(ctx, game, ctx.clock.now(), me.id);
  changed(ctx, game);
  return viewOf(ctx, game, me.id);
};

// POST /santa/:id/open — вскрыл конверт; повтор ничего не меняет. Пустой
// вишлист подопечного — шаг воронки ward_empty (P09).
export const openSantaEnvelope: ServerHandler = async (ctx, { params }) => {
  const me = await readMe(ctx);
  const { game, result: opened } = await withGame(
    ctx,
    params.id ?? "",
    (game) => {
      requireDrawnParticipant(game, me);
      if (game.openedIds.includes(me.id)) return false;
      game.openedIds.push(me.id);
      return true;
    },
  );
  if (opened) {
    const wardId = await wardIdOf(ctx.tx, game.id, me.id);
    await reachStep(ctx.tx, me.id, "envelope_opened", ctx.clock.now());
    // Меньше трёх желаний в бюджете — тот же порог, что у идей P05 (Q02).
    if (
      wardId &&
      (await wishesInBudget(ctx, wardId, game.budget)) < SANTA_WISHES_ENOUGH
    ) {
      await reachStep(ctx.tx, me.id, "ward_empty", ctx.clock.now());
    }
    changed(ctx, game);
  }
  return viewOf(ctx, game, me.id);
};

// POST /santa/:id/bought { bought?, itemKey? } — «Я купил подарок», смена
// покупки и снять отметку (Y05).
//
// Бронь Санты (X02) — его открытая бронь на вишлисте подопечного. Ровно
// одна: сменил покупку — бронь переезжает на новое желание, «Другое» или
// снял отметку — бронь снимается, и друзья подопечного снова могут это
// подарить. Всё в одной транзакции: занятое желание — CONFLICT, и старая
// бронь остаётся.
export const setSantaBought: ServerHandler = async (ctx, { params, body }) => {
  const { bought, itemKey } = parseInput(BoughtBodySchema, body ?? {});
  const me = await readMe(ctx);
  const { game, result: changedNow } = await withGame(
    ctx,
    params.id ?? "",
    (game) => {
      requireDrawnParticipant(game, me);
      if (!game.openedIds.includes(me.id)) {
        throw conflict("Сначала открой конверт");
      }
      const was = game.boughtIds.includes(me.id);
      const others = game.boughtIds.filter((id) => id !== me.id);
      game.boughtIds = bought ? [...others, me.id] : others;
      return was !== bought;
    },
  );
  const wardId = await wardIdOf(ctx.tx, game.id, me.id);
  if (wardId) {
    const keep = bought ? itemKey : undefined;
    // «Купил: …» — бронь желания подопечного под своим именем: у гостей и
    // других Сант оно занято, подопечный, как всегда, не видит кто.
    if (keep) await reserveForWard(ctx, wardId, keep, me);
    await releaseForWard(ctx, wardId, me, keep);
  }
  if (changedNow) changed(ctx, game);
  if (changedNow && bought) {
    await reachStep(ctx.tx, me.id, "santa_bought", ctx.clock.now());
  }
  return viewOf(ctx, game, me.id);
};

const reserveForWard = async (
  ctx: ServerContext,
  wardId: string,
  itemKey: string,
  me: UserRow,
) => {
  const items = await guestItemsOf(ctx.tx, wardId);
  if (!items.some((item) => itemKeyOf(item) === itemKey)) {
    throw notFound("Такого желания нет");
  }
  const [taken] = await ctx.tx
    .select({ by: reservations.reserverId })
    .from(reservations)
    .where(
      and(
        eq(reservations.ownerRef, wardId),
        eq(reservations.itemKey, itemKey),
        isNull(reservations.closedAt),
      ),
    )
    .limit(1);
  if (taken && taken.by !== me.id) {
    throw conflict("Кто-то уже выбрал этот подарок");
  }
  if (taken) return;
  const inserted = await ctx.tx
    .insert(reservations)
    .values({
      id: `rs_${nanoid(10)}`,
      ownerRef: wardId,
      itemKey,
      reserverId: me.id,
      reserverName: me.name ?? "",
      at: new Date(ctx.clock.now()),
    })
    .onConflictDoNothing()
    .returning({ id: reservations.id });
  // Гонка: кто-то успел в ту же миллисекунду — уникальный индекс открытой брони.
  if (inserted.length === 0) throw conflict("Кто-то уже выбрал этот подарок");
  publishWardReservations(ctx, wardId, me);
};

// Снять открытые брони Санты на вишлисте подопечного, кроме keep (Y05):
// сменил покупку или снял отметку — прежнее желание снова свободно.
const releaseForWard = async (
  ctx: ServerContext,
  wardId: string,
  me: UserRow,
  keep: string | undefined,
) => {
  const released = await ctx.tx
    .delete(reservations)
    .where(
      and(
        eq(reservations.ownerRef, wardId),
        eq(reservations.reserverId, me.id),
        isNull(reservations.closedAt),
        keep === undefined ? undefined : ne(reservations.itemKey, keep),
      ),
    )
    .returning({ id: reservations.id });
  if (released.length > 0) publishWardReservations(ctx, wardId, me);
};

const publishWardReservations = (
  ctx: ServerContext,
  wardId: string,
  me: UserRow,
) =>
  ctx.events.publish(
    {
      type: "db:changed",
      scope: ["reservations", "wishlist"],
      id: wardId,
    },
    [wardId, me.id],
  );

// ── Жеребьёвка по дате (планировщик — B13) ─────────────────────────

// Жеребьёвка по дате не прошла (R08): отметка в игре, тост организатору и
// шаг воронки — один раз. Дальше планировщик игру пропускает, пока она не
// изменится.
const markDrawFailed = async (
  ctx: ServerContext,
  id: string,
  reason: string,
  now: number,
) => {
  const before = await loadGame(ctx.tx, id, { lock: true });
  const failedAt = new Date(now).toISOString();
  const game: StoredGame = {
    ...structuredClone(before),
    drawFailed: { at: failedAt, reason },
  };
  await saveGame(ctx.tx, before, game, now);
  // В боте — без причины: она называет людей из исключений (S05).
  await notifySantaDrawFailed(ctx.tx, game, failedAt, now);
  ctx.events.publish(
    {
      type: "toast",
      text: `Жеребьёвка по дате в «${game.title}» не прошла: ${reason}`,
      forUserId: game.ownerId,
    },
    [game.ownerId],
  );
  await countEvent(ctx.tx, "santa_draw_failed", now, game.ownerId);
  changed(ctx, game);
};

// Игра изменилась (вступили, вышли, убрали, правка) — жеребьёвку по дате
// можно попробовать снова (R08).
const clearDrawFailed = (game: StoredGame) => {
  delete game.drawFailed;
};

// Игры, у которых наступил drawAt, — жеребьёвка. Не вышло (меньше 3,
// исключения) — игра ждёт организатора, ничего не записано. Каждая игра —
// в своей точке сохранения: неудача одной не откатывает остальные.
export const drawDueSantaGames = async (
  ctx: ServerContext,
): Promise<SantaTickResult> => {
  const now = ctx.clock.now();
  const due = await ctx.tx
    .select({ id: santaGames.id })
    .from(santaGames)
    .where(
      and(
        eq(santaGames.status, "gathering"),
        isNotNull(santaGames.drawAt),
        lte(santaGames.drawAt, new Date(now)),
        // Уже не прошла и с тех пор не менялась (R08) — не пробуем.
        isNull(santaGames.drawFailedAt),
      ),
    )
    // Строку держит запрос человека — пропустим до следующего прохода.
    .for("update", { skipLocked: true });
  const drawn: string[] = [];
  const drawnGames: StoredGame[] = [];
  const failed: SantaTickResult["failed"] = [];
  for (const { id } of due) {
    try {
      await ctx.tx.transaction(async (savepoint) => {
        const scoped = { ...ctx, tx: savepoint };
        const before = await loadGame(savepoint, id, { lock: true });
        if (before.status !== "gathering") return;
        const game = structuredClone(before);
        const assignments = await performDraw(scoped, game);
        await saveGame(savepoint, before, game, now);
        await saveAssignments(savepoint, id, assignments);
        await notifySantaDrawn(savepoint, game, now);
        await countEvent(savepoint, "santa_drawn_group", now, game.ownerId);
        await countNamesakes(scoped, game, now, game.ownerId);
        drawn.push(id);
        drawnGames.push(game);
      });
    } catch (error) {
      if (!isApiError(error)) throw error;
      failed.push({ id, reason: error.message });
      await markDrawFailed(ctx, id, error.message, now);
    }
  }
  for (const game of drawnGames) changed(ctx, game);
  return { drawn, failed };
};
