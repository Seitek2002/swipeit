import { toDateKey } from "@/shared/lib/format";

import type { Activity, Product } from "../../catalog/types";
import type { PlanFilters, PlanSession } from "../../plans/types";
import type { SantaGame } from "../../santa/types";
import type { User } from "../../users/types";
import type { ProductSwipe, WishlistItem } from "../../wishlist/types";
import { likeChance } from "../bots/plans";
import type { Db } from "../db";
import { ApiError, notFound } from "../errors";
import { matchesAudience } from "../feed";
import { matchesPlanFilters } from "../handlers/activities";
import { type Random, createSeededRandom } from "../random";
import { DEMO_USER_ID } from "../seed";

// Сценарий «Новый год» (TASKS T19, кнопка в демо-панели — DESIGN.md §8.10):
// поверх свежего сида — всё, что нужно для показа за 7 минут. Айгерим с
// вишлистом из 7 желаний к Новому году, у Нурай ДР через 5 дней (это уже
// делает сид — от часов демо), план «Новогодние каникулы» «До даты», где
// двое ботов уже досвайпали, и Тайный Санта «Офис, Новый год» на 6
// человек, готовый к жеребьёвке.
//
// Случайность — своя, с фиксированным сидом: сценарий одинаковый при каждой
// загрузке, и по DEMO.md можно говорить заранее, что увидят на экране.

const DAY = 24 * 60 * 60 * 1000;

export const NEW_YEAR_PLAN_ID = "pl_new_year";
export const NEW_YEAR_SANTA_ID = "sg_new_year";

const WISH_COUNT = 7;
const TOP_COUNT = 2;
const WISH_NOTE = "Давно хочу такое";
const WISH_MESSAGE = "С наступающим! Буду рада любому подарку из списка";

// План: Айгерим и трое ботов. Азамат и Тимур уже досвайпали колоду,
// Мээрим — на трети колоды и дальше свайпает сама (resume движка ботов).
const PLAN_FINISHED_BOTS = ["u_azamat", "u_timur"];
const PLAN_SWIPING_BOT = "u_meerim";
const PLAN_DECK_SIZE = 12;
// Сколько занятий двое досвайпавших должны лайкнуть вместе: с «Хочу»
// Айгерим это уже «почти совпадение» (3 из 4).
const PLAN_COMMON_LIKES = 2;
const PLAN_FILTERS: PlanFilters = {
  categories: ["active", "nature", "party"],
  budgetPerPerson: { min: 0, max: 3000 },
};

// Санта: Айгерим и 5 ботов, у которых вишлист есть с сида (у Тимура и
// Бекзата его нет — они «собирают» вишлист на глазах в своих играх).
const SANTA_BOTS = ["u_azamat", "u_nurai", "u_daniyar", "u_meerim", "u_alina"];
const SANTA_BUDGET = 2000;

export type NewYearScenarioIds = { planId: string; santaId: string };

type ScenarioInput = {
  activities: Activity[];
  now: number;
  products: Product[];
};

const firstOptions = (product: Product) =>
  product.variants?.reduce<Record<string, string>>((choice, group) => {
    const option = group.options[0];
    if (option) choice[group.id] = option.id;
    return choice;
  }, {});

const hasVariants = (product: Product | undefined) =>
  (product?.variants ?? []).some((group) => group.options.length > 0);

const requireUserIn = (db: Db, id: string): User => {
  const user = db.users[id];
  if (!user) throw notFound("Демо-друг не найден — сбрось демо-данные");
  return user;
};

// Вишлист Айгерим: 7 желаний из сида (не хватит — добираем популярным из
// каталога), два «Очень хочу», одно с заметкой, одно с выбранным вариантом.
const buildWishlist = (db: Db, { now, products }: ScenarioInput) => {
  const owner = requireUserIn(db, DEMO_USER_ID);
  const byId = new Map(products.map((product) => [product.id, product]));
  const seeded = (db.wishlistItems[DEMO_USER_ID] ?? []).flatMap((item) =>
    item.source.kind === "product" ? [item.source.productId] : [],
  );
  const suitable = products
    .filter((product) => matchesAudience(product, owner.audience))
    .sort((a, b) => b.popularity - a.popularity);
  const ids = [...new Set(seeded)].filter((id) => byId.has(id));
  for (const product of suitable) {
    if (ids.length >= WISH_COUNT) break;
    if (!ids.includes(product.id)) ids.push(product.id);
  }
  ids.splice(WISH_COUNT);
  // Желание с вариантом — показать «Цвет: …» в карточке. В сиде такого
  // может не оказаться — тогда последнее меняем на товар с вариантами.
  if (!ids.some((id) => hasVariants(byId.get(id)))) {
    const withVariants = suitable.find(
      (product) => hasVariants(product) && !ids.includes(product.id),
    );
    if (withVariants && ids.length > 0) ids[ids.length - 1] = withVariants.id;
  }
  const variantIndex = ids.findIndex((id) => hasVariants(byId.get(id)));
  // Заметка — не на «Очень хочу» и не на желании с вариантом.
  const noteIndex = [2, 3, 4].find((index) => index !== variantIndex) ?? 2;

  const items: WishlistItem[] = ids.map((productId, index) => {
    const product = byId.get(productId);
    const variantChoice =
      index === variantIndex && product ? firstOptions(product) : undefined;
    return {
      id: `wi_ny_${index}`,
      ownerId: DEMO_USER_ID,
      source: { kind: "product", productId },
      priority: index < TOP_COUNT ? "top" : "normal",
      order: index,
      ...(variantChoice ? { variantChoice } : {}),
      ...(index === noteIndex ? { note: WISH_NOTE } : {}),
      status: "active",
      addedAt: new Date(now - (14 - index) * DAY).toISOString(),
    };
  });
  db.wishlistItems[DEMO_USER_ID] = items;

  // Свайпы — ровно под вишлист: желание, убранное из сида, не должно
  // оставлять «Хочу» без карточки.
  const swipes: ProductSwipe[] = items.map((item, index) => ({
    id: `sw_ny_${index}`,
    userId: DEMO_USER_ID,
    productId: item.source.kind === "product" ? item.source.productId : "",
    decision: item.priority === "top" ? "superlike" : "like",
    context: { kind: "self" },
    ...(item.variantChoice ? { variantChoice: item.variantChoice } : {}),
    at: item.addedAt,
  }));
  db.productSwipes = [
    ...db.productSwipes.filter((swipe) => swipe.userId !== DEMO_USER_ID),
    ...swipes,
  ];

  const year = new Date(now).getFullYear();
  db.wishlistMeta[DEMO_USER_ID] = {
    ownerId: DEMO_USER_ID,
    hideReservationCount: false,
    // Отправить вишлист можно сразу — 7 «Хочу» уже есть.
    shareUnlockedAt: items[0]?.addedAt ?? new Date(now).toISOString(),
    occasion: { kind: "new_year", date: `${year}-12-31` },
    message: WISH_MESSAGE,
  };
};

// Зимние занятия: без сезона (круглый год) или с зимой.
const fitsWinter = (activity: Activity) =>
  activity.seasons.length === 0 || activity.seasons.includes("winter");

// Колода плана: активное, природа и повеселиться до 3 000 сом, что
// подходит зиме. Каталог маленький (заглушка) — берём, что есть.
const deckFor = (activities: Activity[], random: Random) => {
  const filtered = activities.filter((a) =>
    matchesPlanFilters(a, PLAN_FILTERS),
  );
  const winter = filtered.filter(fitsWinter);
  const pool =
    winter.length >= 4 ? winter : filtered.length > 0 ? filtered : activities;
  if (pool.length === 0) {
    throw new ApiError(409, "CONFLICT", "В каталоге нет занятий для плана");
  }
  return random.shuffle(pool).slice(0, PLAN_DECK_SIZE);
};

// Свайпы бота как в его поведении (bots/plans.ts): база + любимые
// категории + «Недорого».
const botSwipes = (
  bot: User,
  cards: Activity[],
  random: Random,
): Record<string, "like" | "pass"> =>
  Object.fromEntries(
    cards.map((card) => [
      card.id,
      random.next() < likeChance(bot, card) ? "like" : "pass",
    ]),
  );

const buildPlan = (
  db: Db,
  { activities, now }: ScenarioInput,
  random: Random,
): PlanSession => {
  const deck = deckFor(activities, random);
  const finished = PLAN_FINISHED_BOTS.map((id) => requireUserIn(db, id));
  const swiping = requireUserIn(db, PLAN_SWIPING_BOT);
  const swipes: PlanSession["swipes"] = {};
  for (const bot of finished) swipes[bot.id] = botSwipes(bot, deck, random);

  // Чтобы «почти совпадение» появилось от первого же «Хочу» Айгерим, у
  // досвайпавших должно быть общее: не хватает — добавляем лайки на то,
  // что обоим нравится больше всего.
  const likedByAll = (id: string) =>
    finished.every((bot) => swipes[bot.id]?.[id] === "like");
  const byAppeal = [...deck].sort(
    (a, b) =>
      finished.reduce((sum, bot) => sum + likeChance(bot, b), 0) -
      finished.reduce((sum, bot) => sum + likeChance(bot, a), 0),
  );
  let common = deck.filter((card) => likedByAll(card.id)).length;
  for (const card of byAppeal) {
    if (common >= Math.min(PLAN_COMMON_LIKES, deck.length)) break;
    if (likedByAll(card.id)) continue;
    for (const bot of finished) {
      swipes[bot.id] = { ...swipes[bot.id], [card.id]: "like" };
    }
    common += 1;
  }

  // Мээрим «на трети колоды» — прогресс в плане виден сразу.
  const started = deck.slice(0, Math.floor(deck.length / 3));
  swipes[swiping.id] = botSwipes(swiping, started, random);

  return {
    id: NEW_YEAR_PLAN_ID,
    title: "Новогодние каникулы",
    ownerId: DEMO_USER_ID,
    mode: "deadline",
    deadline: new Date(now + 3 * DAY).toISOString(),
    status: "swiping",
    participantIds: [DEMO_USER_ID, ...PLAN_FINISHED_BOTS, PLAN_SWIPING_BOT],
    readyIds: [],
    matchRule: "all",
    filters: PLAN_FILTERS,
    customActivityIds: [],
    deck: deck.map((activity) => activity.id),
    swipes,
    finishedIds: [...PLAN_FINISHED_BOTS],
    votes: {},
    createdAt: new Date(now - DAY).toISOString(),
  };
};

// Обмен — 27 декабря этого года, а если он уже прошёл — следующего.
const exchangeDateFor = (now: number) => {
  const year = new Date(now).getFullYear();
  const date = `${year}-12-27`;
  return date < toDateKey(now) ? `${year + 1}-12-27` : date;
};

const buildSanta = (db: Db, { now }: ScenarioInput): SantaGame => {
  for (const id of SANTA_BOTS) requireUserIn(db, id);
  return {
    id: NEW_YEAR_SANTA_ID,
    title: "Офис, Новый год",
    ownerId: DEMO_USER_ID,
    budget: SANTA_BUDGET,
    exchangeDate: exchangeDateFor(now),
    // Жеребьёвка вручную — её проводят на показе.
    status: "gathering",
    participantIds: [DEMO_USER_ID, ...SANTA_BOTS],
    invitedIds: [],
    exclusions: [],
    openedIds: [],
    boughtIds: [],
    createdAt: new Date(now - 2 * DAY).toISOString(),
  };
};

// Достраивает свежий сид до сценария. Айгерим — человек: от её имени
// смотрят показ, и боты не должны действовать за неё.
export const applyNewYearScenario = (
  db: Db,
  input: ScenarioInput,
): NewYearScenarioIds => {
  const random = createSeededRandom("swipeit-new-year");
  requireUserIn(db, DEMO_USER_ID).isBot = false;
  buildWishlist(db, input);
  const plan = buildPlan(db, input, random);
  db.plans[plan.id] = plan;
  const game = buildSanta(db, input);
  db.santaGames[game.id] = game;
  return { planId: plan.id, santaId: game.id };
};
