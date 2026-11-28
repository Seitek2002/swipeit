import type {
  ActivityCategoryId,
  AvatarColor,
  CategoryId,
} from "@/shared/config";
import { birthdayInDays, nextBirthdayDate } from "@/shared/lib/format";

import type { Product } from "../catalog/types";
import type { User } from "../users/types";
import type {
  ProductSwipe,
  WishlistItem,
  WishlistMeta,
} from "../wishlist/types";
import type { CatalogAccess, Clock } from "./context";
import { type Db, createEmptyDb } from "./db";
import { matchesAudience } from "./feed";
import { type Random, createSeededRandom } from "./random";
import { computeTaste } from "./taste";
import { normalizeWishlists } from "./wishlists";

// Демо-пользователь «Айгерим» (TECH_SPEC §6, POST /auth/demo): готовый профиль
// с вишлистом. Это тот же человек, что и бот-подруга Айгерим, — при демо-входе
// она перестаёт быть ботом. Так в демо нет двух разных «Айгерим».
export const DEMO_USER_ID = "u_aigerim";
// Значимая дата Айгерим в сиде — «Годовщина, 2 июня».
export const DEMO_ANNIVERSARY_ID = "d_seed_anniversary";

const DAY = 24 * 60 * 60 * 1000;

type BotSeed = {
  audience: User["audience"];
  birthday?: string;
  // Через сколько дней ДР — «у двоих в ближайшие 2 недели» (TASKS T04).
  birthdayInDays?: number;
  color: AvatarColor;
  id: string;
  interests: string[];
  likeProbability: number;
  likes: (ActivityCategoryId | CategoryId)[];
  name: string;
  speedFactor: number;
  wishCount: number;
};

// 8 демо-друзей (TASKS T04, п. 5) с разными интересами и темпом.
const BOTS: BotSeed[] = [
  {
    id: DEMO_USER_ID,
    name: "Айгерим",
    color: "mandarin",
    audience: "female",
    interests: ["beauty", "coffee", "photo", "travel"],
    likes: ["beauty", "kitchen", "chill", "food"],
    likeProbability: 0.45,
    speedFactor: 1,
    birthday: "03-14",
    wishCount: 8,
  },
  {
    id: "u_azamat",
    name: "Азамат",
    color: "mint",
    audience: "male",
    interests: ["gadgets", "gaming", "cars", "fitness"],
    likes: ["tech", "games", "active", "party"],
    likeProbability: 0.4,
    speedFactor: 0.8,
    birthday: "07-22",
    wishCount: 10,
  },
  {
    id: "u_nurai",
    name: "Нурай",
    color: "champagne",
    audience: "female",
    interests: ["art", "reading", "home", "plants"],
    likes: ["hobby", "books", "home", "culture", "chill"],
    likeProbability: 0.5,
    speedFactor: 1.2,
    birthdayInDays: 5,
    wishCount: 9,
  },
  {
    id: "u_daniyar",
    name: "Данияр",
    color: "rose",
    audience: "male",
    interests: ["mountains", "travel", "photo", "music"],
    likes: ["outdoor", "tech", "nature", "active"],
    likeProbability: 0.45,
    speedFactor: 1,
    birthdayInDays: 12,
    wishCount: 7,
  },
  {
    id: "u_meerim",
    name: "Мээрим",
    color: "pomegranate",
    audience: "female",
    interests: ["fashion", "beauty", "music", "wellness"],
    likes: ["fashion", "jewelry", "beauty", "selfcare", "party"],
    likeProbability: 0.55,
    speedFactor: 0.7,
    birthday: "05-09",
    wishCount: 12,
  },
  {
    id: "u_timur",
    name: "Тимур",
    color: "plum",
    audience: "male",
    interests: ["boardgames", "cooking", "coffee", "anime"],
    likes: ["games", "kitchen", "chill", "food"],
    likeProbability: 0.4,
    speedFactor: 1.4,
    birthday: "09-30",
    // У Тимура и Бекзата вишлиста пока нет (~70% ботов с вишлистом, TECH_SPEC
    // §7): в Тайном Санте они «собирают» его на глазах (T16).
    wishCount: 0,
  },
  {
    id: "u_bekzat",
    name: "Бекзат",
    color: "olive",
    audience: "male",
    interests: ["fitness", "mountains", "cars", "gadgets"],
    likes: ["sport", "auto", "active", "nature"],
    likeProbability: 0.35,
    speedFactor: 1.1,
    birthday: "01-17",
    wishCount: 0,
  },
  {
    id: "u_alina",
    name: "Алина",
    color: "graphite",
    audience: "female",
    interests: ["pets", "home", "cooking", "reading"],
    likes: ["pets", "home", "kitchen", "culture"],
    likeProbability: 0.5,
    speedFactor: 0.9,
    birthday: "11-03",
    wishCount: 11,
  },
];

export const BOT_IDS = BOTS.map((bot) => bot.id);

// Заметки — без рода, чтобы подходили и ей, и ему.
const NOTES = ["Давно хочу такое", "Любой вариант подойдёт"];

// Подбор желаний бота из каталога: совпадение интересов + популярность +
// немного случая, не больше трёх товаров одной категории.
const pickWishes = (products: Product[], bot: BotSeed, random: Random) => {
  const scored = products
    .filter((product) => matchesAudience(product, bot.audience))
    .map((product) => ({
      product,
      score:
        2 *
          product.interests.filter((id) => bot.interests.includes(id)).length +
        product.popularity +
        random.next() * 1.5,
    }))
    .sort((a, b) => b.score - a.score);

  const perCategory = new Map<string, number>();
  const result: Product[] = [];
  for (const { product } of scored) {
    if (result.length >= bot.wishCount) break;
    const count = perCategory.get(product.category) ?? 0;
    if (count >= 3) continue;
    perCategory.set(product.category, count + 1);
    result.push(product);
  }
  return result;
};

const firstOptions = (product: Product) =>
  product.variants?.reduce<Record<string, string>>((choice, group) => {
    const option = group.options[0];
    if (option) choice[group.id] = option.id;
    return choice;
  }, {});

// Демо-данные: 8 ботов-друзей с днями рождения, вкусами и вишлистами из
// каталога. Сид фиксированный — после сброса данные те же, только дни
// рождения «в ближайшие дни» считаются от текущих часов демо.
export const createSeedDb = ({
  products,
  now,
}: {
  now: number;
  products: Product[];
}): Db => {
  const db = createEmptyDb();
  const random = createSeededRandom("swipeit-demo-seed");
  const createdAt = new Date(now - 30 * DAY).toISOString();

  for (const bot of BOTS) {
    const birthday =
      bot.birthdayInDays !== undefined
        ? birthdayInDays(bot.birthdayInDays, now)
        : bot.birthday;
    const isDemoUser = bot.id === DEMO_USER_ID;

    db.users[bot.id] = {
      id: bot.id,
      name: bot.name,
      avatarColor: bot.color,
      birthday,
      interests: bot.interests,
      audience: bot.audience,
      isBot: true,
      bot: {
        likesCategories: bot.likes,
        likeProbability: bot.likeProbability,
        speedFactor: bot.speedFactor,
      },
      createdAt,
    };
    db.friends[bot.id] = BOTS.filter((other) => other.id !== bot.id).map(
      (other) => other.id,
    );

    const wishes = pickWishes(products, bot, random);
    const items: WishlistItem[] = wishes.map((product, index) => {
      const addedAt = new Date(now - (20 - index) * DAY).toISOString();
      const isTop = index < 2;
      return {
        id: `wi_seed_${bot.id}_${index}`,
        ownerId: bot.id,
        source: { kind: "product", productId: product.id },
        priority: isTop ? "top" : "normal",
        order: index,
        variantChoice: index % 3 === 1 ? firstOptions(product) : undefined,
        note: index === 2 ? NOTES[0] : index === 5 ? NOTES[1] : undefined,
        status: "active",
        addedAt,
      };
    });
    db.wishlistItems[bot.id] = items;

    const swipes: ProductSwipe[] = items.map((item, index) => ({
      id: `sw_seed_${bot.id}_${index}`,
      userId: bot.id,
      productId: item.source.kind === "product" ? item.source.productId : "",
      decision: item.priority === "top" ? "superlike" : "like",
      context: { kind: "self" },
      at: item.addedAt,
    }));
    db.productSwipes.push(...swipes);
    // Вкус из тех же свайпов — как если бы их сделал человек (TECH_SPEC §6
    // «Вкус»): у Айгерим в профиле сразу есть «Похоже, тебе нравится».
    const taste = computeTaste(swipes, products);
    const seeded = db.users[bot.id];
    if (taste && seeded) seeded.taste = taste;

    const meta: WishlistMeta = {
      ownerId: bot.id,
      hideReservationCount: false,
      // Пустой вишлист отправлять нечего — откроется на 5-м «Хочу», как у
      // человека.
      ...(items.length > 0 ? { shareUnlockedAt: createdAt } : {}),
    };
    if (isDemoUser) {
      // Демо-вход: вишлист «к Новому году» — главный сезон демо.
      const year = new Date(now).getFullYear();
      meta.occasion = { kind: "new_year", date: `${year}-12-31` };
      meta.message = "Буду рада любому подарку из списка";
      // «Мои даты» в профиле не пустые: день рождения (03-14) и одна
      // значимая дата с готовым поводом (TASKS T24, «Сид»).
      db.importantDates[bot.id] = [
        {
          id: DEMO_ANNIVERSARY_ID,
          ownerId: bot.id,
          date: "06-02",
          preset: "anniversary",
          autoNumber: 1,
          createdAt,
        },
      ];
    } else if (birthday) {
      meta.occasion = {
        kind: "birthday",
        date: nextBirthdayDate(birthday, now),
      };
    }
    db.wishlistMeta[bot.id] = meta;
  }

  // «Общий» каждому — с поводом и сообщением из meta (spec §3.6).
  return normalizeWishlists(db);
};

// Начальная база для адаптеров: сид из текущего каталога и часов.
export const buildSeedDb = async ({
  catalog,
  clock,
}: {
  catalog: CatalogAccess;
  clock: Clock;
}): Promise<Db> =>
  createSeedDb({ products: await catalog.products(), now: clock.now() });
