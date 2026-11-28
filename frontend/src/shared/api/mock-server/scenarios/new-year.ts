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
import { computeTaste } from "../taste";
import { defaultListOf, ensureLists } from "../wishlists";

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
// Мээрим — на полпути и дальше свайпает сама (resume движка ботов): по
// «Нормально» досвайпывает за 20–85 с после загрузки сценария или смены
// настроек демо — строка «Мээрим досвайпала колоду» в ленте событий.
const PLAN_FINISHED_BOTS = ["u_azamat", "u_timur"];
const PLAN_SWIPING_BOT = "u_meerim";
const PLAN_DECK_SIZE = 12;
// Сколько карточек Мээрим свайпнула до показа.
const PLAN_SWIPING_DONE = 6;
// Где в колоде занятия, которые все трое ботов лайкнули (с нуля): 2-я, 4-я
// и 5-я карточки. Свайпнул вправо 4–5 билетиков — «Совпадение!» на 2-м,
// а к итогам 2–3 совпадения, и барабану есть из чего выбрать. Все — в
// той части, что Мээрим уже прошла: её живые свайпы итог не меняют.
const PLAN_MATCH_POSITIONS = [1, 3, 4];
const PLAN_FILTERS: PlanFilters = {
  categories: ["active", "nature", "party"],
  budgetPerPerson: { min: 0, max: 3000 },
};

// Санта: Айгерим и 5 ботов, у которых вишлист есть с сида (у Тимура и
// Бекзата его нет — они «собирают» вишлист на глазах в своих играх).
const SANTA_BOTS = ["u_azamat", "u_nurai", "u_daniyar", "u_meerim", "u_alina"];
const SANTA_BUDGET = 2000;
// Кто бы ни выпал в жеребьёвке, в его вишлисте должно быть из чего
// выбрать в рамках бюджета: не меньше 4 желаний не дороже 2 000 сом.
const SANTA_MIN_IN_BUDGET = 4;

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
  // Вкус — по новым свайпам: «Похоже, тебе нравится» в профиле Айгерим
  // должно совпадать с её вишлистом.
  const taste = computeTaste(swipes, byId);
  if (taste) owner.taste = taste;
  else delete owner.taste;

  const year = new Date(now).getFullYear();
  db.wishlistMeta[DEMO_USER_ID] = {
    ownerId: DEMO_USER_ID,
    hideReservationCount: false,
    // Отправить вишлист можно сразу — 7 «Хочу» уже есть.
    shareUnlockedAt: items[0]?.addedAt ?? new Date(now).toISOString(),
    occasion: { kind: "new_year", date: `${year}-12-31` },
    message: WISH_MESSAGE,
  };
  // Повод и сообщение живут в вишлисте (spec-multi-wishlists §2.1).
  const list = defaultListOf(ensureLists(db, DEMO_USER_ID));
  list.occasion = { kind: "new_year", date: `${year}-12-31` };
  list.message = WISH_MESSAGE;
};

// Зимние занятия: без сезона (круглый год) или с зимой.
const fitsWinter = (activity: Activity) =>
  activity.seasons.length === 0 || activity.seasons.includes("winter");

// Занятия плана: активное, природа и повеселиться до 3 000 сом, что
// подходит зиме. Каталог маленький (заглушка) — берём, что есть.
const cardsFor = (activities: Activity[], random: Random) => {
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

// Сколько ботам вместе «нравится» занятие — по шансам их поведения.
const appealOf = (bots: User[], card: Activity) =>
  bots.reduce((sum, bot) => sum + likeChance(bot, card), 0);

// Колода: совпадения — самые привлекательные для ботов занятия, на своих
// местах (PLAN_MATCH_POSITIONS), остальное — в перемешанном порядке.
// Хотя бы одна карточка Мээрим — на показ: иначе она «досвайпала» бы
// молча, без строки в ленте.
const swipedBeforeShow = (deckSize: number) =>
  Math.max(0, Math.min(PLAN_SWIPING_DONE, deckSize - 1));

const deckFor = (cards: Activity[], bots: User[]) => {
  // Совпадения — только там, где Мээрим уже свайпнула.
  const positions = PLAN_MATCH_POSITIONS.filter(
    (position) => position < swipedBeforeShow(cards.length),
  );
  // sort стабильный: при равных шансах решает перемешанный порядок.
  const matches = [...cards]
    .sort((a, b) => appealOf(bots, b) - appealOf(bots, a))
    .slice(0, positions.length);
  const rest = cards.filter((card) => !matches.includes(card));
  const deck: Activity[] = [];
  for (let index = 0; index < cards.length; index += 1) {
    const slot = positions.indexOf(index);
    const card = slot >= 0 ? matches[slot] : rest.shift();
    if (card) deck.push(card);
  }
  return { deck, matchIds: new Set(matches.map((card) => card.id)) };
};

// Свайп бота как в его поведении (bots/plans.ts): база + любимые
// категории + «Недорого».
const botSwipe = (bot: User, card: Activity, random: Random) =>
  random.next() < likeChance(bot, card) ? "like" : "pass";

const buildPlan = (
  db: Db,
  { activities, now }: ScenarioInput,
  random: Random,
): PlanSession => {
  const finished = PLAN_FINISHED_BOTS.map((id) => requireUserIn(db, id));
  const swiping = requireUserIn(db, PLAN_SWIPING_BOT);
  const bots = [...finished, swiping];
  const { deck, matchIds } = deckFor(cardsFor(activities, random), bots);
  const started = new Set(
    deck.slice(0, swipedBeforeShow(deck.length)).map((card) => card.id),
  );

  const swipes: Record<string, Record<string, "like" | "pass">> = {};
  for (const bot of bots) swipes[bot.id] = {};
  for (const card of deck) {
    // Кто «голосует» по карточке до показа: досвайпавшие — за всю колоду,
    // Мээрим — за начало.
    const voters = started.has(card.id) ? bots : finished;
    for (const bot of voters) {
      const mine = swipes[bot.id] ?? {};
      mine[card.id] = matchIds.has(card.id)
        ? "like"
        : botSwipe(bot, card, random);
      swipes[bot.id] = mine;
    }
    if (matchIds.has(card.id)) continue;
    // Не совпадение — значит, кто-то из ботов против. Там, где Мээрим ещё
    // не свайпала, — кто-то из досвайпавших: иначе её живой лайк сделал бы
    // совпадение, и итог показа зависел бы от случая. Отказывается тот,
    // кому занятие нравится меньше.
    if (voters.every((bot) => swipes[bot.id]?.[card.id] === "like")) {
      const reluctant = [...voters].sort(
        (a, b) => likeChance(a, card) - likeChance(b, card),
      )[0];
      if (reluctant) {
        swipes[reluctant.id] = { ...swipes[reluctant.id], [card.id]: "pass" };
      }
    }
  }

  return {
    id: NEW_YEAR_PLAN_ID,
    title: "Новогодние каникулы",
    ownerId: DEMO_USER_ID,
    mode: "deadline",
    deadline: eveningIn(now, 3),
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

// Вишлисты участников Санты: в сиде у кого-то почти всё дороже бюджета
// (у Азамата — техника). Добираем желаниями в бюджете на место последних
// обычных «дороже бюджета» — по интересам и популярности, без случая.
// «Очень хочу» не трогаем. id желаний и свайпов остаются прежними.
const fitSantaWishlists = (db: Db, { products }: ScenarioInput) => {
  const byId = new Map(products.map((product) => [product.id, product]));
  const priceOf = (item: WishlistItem) =>
    item.source.kind === "product"
      ? byId.get(item.source.productId)?.priceMin
      : (item.source.custom.priceMin ?? item.source.custom.priceMax);
  const inBudget = (item: WishlistItem) => {
    const price = priceOf(item);
    return price !== undefined && price <= SANTA_BUDGET;
  };

  for (const id of SANTA_BOTS) {
    const bot = requireUserIn(db, id);
    const items = db.wishlistItems[id] ?? [];
    let missing =
      SANTA_MIN_IN_BUDGET -
      items.filter((item) => item.status === "active" && inBudget(item)).length;
    if (missing <= 0) continue;
    const taken = new Set(
      items.flatMap((item) =>
        item.source.kind === "product" ? [item.source.productId] : [],
      ),
    );
    const candidates = products
      .filter(
        (product) =>
          product.priceMin <= SANTA_BUDGET &&
          !taken.has(product.id) &&
          matchesAudience(product, bot.audience),
      )
      .map((product) => ({
        product,
        score:
          2 *
            product.interests.filter((interest) =>
              bot.interests.includes(interest),
            ).length +
          product.popularity,
      }))
      .sort((a, b) => b.score - a.score)
      .map(({ product }) => product);
    for (let index = items.length - 1; index >= 0 && missing > 0; index -= 1) {
      const item = items[index];
      if (!item || item.status !== "active" || item.priority === "top") {
        continue;
      }
      if (inBudget(item) || item.source.kind !== "product") continue;
      const product = candidates.shift();
      if (!product) break;
      // Вариант был у прежнего товара — берём первый у нового (если есть).
      const variantChoice = item.variantChoice
        ? firstOptions(product)
        : undefined;
      items[index] = {
        ...item,
        source: { kind: "product", productId: product.id },
        variantChoice:
          variantChoice && Object.keys(variantChoice).length > 0
            ? variantChoice
            : undefined,
      };
      const previous = item.source.productId;
      db.productSwipes = db.productSwipes.map((swipe) =>
        swipe.userId === id && swipe.productId === previous
          ? { ...swipe, productId: product.id }
          : swipe,
      );
      missing -= 1;
    }
    db.wishlistItems[id] = items;
  }
};

// Обмен — 27 декабря этого года, а если он уже прошёл — следующего.
const exchangeDateFor = (now: number) => {
  const year = new Date(now).getFullYear();
  const date = `${year}-12-27`;
  return date < toDateKey(now) ? `${year + 1}-12-27` : date;
};

// Последние 20:00 не позже чем через days дней: «До 1 декабря, 20:00», а не
// «02:13» — время загрузки сценария до минуты (auto-tasks U15). Не позже —
// чтобы «Перемотать на 1 день» ×3 из DEMO.md всегда доходило до итогов.
const eveningIn = (now: number, days: number) => {
  const limit = now + days * DAY;
  const date = new Date(limit);
  date.setHours(20, 0, 0, 0);
  if (date.getTime() > limit) date.setDate(date.getDate() - 1);
  return date.toISOString();
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
    removedIds: [],
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
  fitSantaWishlists(db, input);
  const game = buildSanta(db, input);
  db.santaGames[game.id] = game;
  return { planId: plan.id, santaId: game.id };
};
