import type { FeedResponse } from "../../catalog/types";
import type { User } from "../../users/types";
import type { BotApi, BotBehavior } from "./engine";

// Боты в Тайном Санте (TECH_SPEC §7). Всё — через те же маршруты, что у
// людей: вступить, собрать вишлист свайпами своей ленты, вскрыть конверт,
// «Я купил подарок». Задержки × «Скорость ботов» и темп бота (0.7–1.4).

// Позванный бот вступает через 2–10 с после создания игры: игра с 5
// ботами собирается сама примерно за 10 секунд (TASKS T16).
const JOIN_DELAY_MS: [number, number] = [2_000, 10_000];

// Бот без вишлиста (у части демо-друзей его нет — сид) «собирает» его
// через 20–60 с после вступления: статус «без вишлиста» меняется на
// «вишлист готов» на глазах.
const COLLECT_DELAY_MS: [number, number] = [20_000, 60_000];
// Сколько «Хочу» ставит бот, собирая вишлист: от 5 — так у него
// открывается и «Отправить вишлист», как у человека.
const COLLECT_LIKES: [number, number] = [5, 8];

// После жеребьёвки — вскрыть конверт в течение минуты, потом через 30–120
// с отметить «Купил».
const OPEN_DELAY_MS: [number, number] = [3_000, 60_000];
const BUY_DELAY_MS: [number, number] = [30_000, 120_000];

// Род — по «Показывать подарки» бота, как в ленте броней и планов.
const byGender = (bot: User, male: string, female: string, any: string) =>
  bot.audience === "female" ? female : bot.audience === "male" ? male : any;

const gamePath = (gameId: string) => `/santa/${encodeURIComponent(gameId)}`;

const hasWishlist = async (api: BotApi, botId: string) =>
  ((await api.db.read()).wishlistItems[botId] ?? []).some(
    (item) => item.status === "active",
  );

// Собрать вишлист: лента бота (она уже учитывает его интересы и «Показывать
// подарки») и несколько «Хочу» подряд — первое «Очень хочу».
const collectWishlist = (api: BotApi, bot: User) =>
  api.schedule(bot, COLLECT_DELAY_MS, async () => {
    // Мог собрать для другой игры, пока «думал».
    if (await hasWishlist(api, bot.id)) return;
    const [min, max] = COLLECT_LIKES;
    const count = min + api.random.int(max - min + 1);
    const feed = await api.as<FeedResponse>(bot.id, {
      method: "GET",
      path: "/catalog/feed",
      query: { limit: count },
    });
    let liked = 0;
    for (const product of feed.items) {
      await api.as(bot.id, {
        method: "POST",
        path: "/swipes",
        body: {
          productId: product.id,
          decision: liked === 0 ? "superlike" : "like",
          context: { kind: "self" },
        },
      });
      liked += 1;
    }
    if (liked === 0) return;
    api.report(
      bot.id,
      `${bot.name} ${byGender(bot, "собрал", "собрала", "собрал(а)")} вишлист`,
    );
  });

const botsOf = async (api: BotApi, ids: string[]) => {
  const db = await api.db.read();
  return ids
    .map((id) => db.users[id])
    .filter((user): user is User => Boolean(user?.isBot));
};

// Позванные боты вступают в игру, которая ещё собирается. Уже вступивших не
// трогаем: повтор (resume после перезагрузки или смены вкладки-лидера)
// безопасен (auto-tasks U04).
const joinInvited = async (api: BotApi, gameId: string) => {
  const db = await api.db.read();
  const game = db.santaGames[gameId];
  if (!game || game.status !== "gathering") return;
  const waiting = game.invitedIds.filter(
    (id) => !game.participantIds.includes(id),
  );
  for (const bot of await botsOf(api, waiting)) {
    api.schedule(
      bot,
      JOIN_DELAY_MS,
      async () => {
        const current = await gameNow(api, gameId);
        if (
          current?.status !== "gathering" ||
          current.participantIds.includes(bot.id)
        ) {
          return;
        }
        await api.as(bot.id, {
          method: "POST",
          path: `${gamePath(game.id)}/join`,
        });
        api.report(
          bot.id,
          `${bot.name} ${byGender(bot, "вступил", "вступила", "вступил(а)")} в «${game.title}»`,
        );
        if (!(await hasWishlist(api, bot.id))) collectWishlist(api, bot);
      },
      `santa:join:${gameId}:${bot.id}`,
    );
  }
};

// Игра сейчас — шаг бота мог уже сделать повтор (resume запускается и при
// смене настроек демо): перед действием перечитываем.
const gameNow = async (api: BotApi, gameId: string) =>
  (await api.db.read()).santaGames[gameId];

// «Я купил подарок» — после вскрытия конверта.
const buyLater = (api: BotApi, bot: User, gameId: string, title: string) =>
  api.schedule(
    bot,
    BUY_DELAY_MS,
    async () => {
      if ((await gameNow(api, gameId))?.boughtIds.includes(bot.id)) return;
      await api.as(bot.id, {
        method: "POST",
        path: `${gamePath(gameId)}/bought`,
        body: { bought: true },
      });
      // Кому — не пишем: даже в ленте демо-панели пары не видны.
      api.report(
        bot.id,
        `${bot.name} ${byGender(bot, "купил", "купила", "купил(а)")} подарок в «${title}»`,
      );
    },
    `santa:buy:${gameId}:${bot.id}`,
  );

// После жеребьёвки боты вскрывают конверт, потом отмечают «Купил». Тех, кто
// уже вскрыл или купил, продолжаем с их шага — для resume.
const openAndBuy = async (api: BotApi, gameId: string) => {
  const db = await api.db.read();
  const game = db.santaGames[gameId];
  if (!game || game.status !== "drawn") return;
  for (const bot of await botsOf(api, game.participantIds)) {
    if (game.boughtIds.includes(bot.id)) continue;
    if (game.openedIds.includes(bot.id)) {
      buyLater(api, bot, game.id, game.title);
      continue;
    }
    api.schedule(
      bot,
      OPEN_DELAY_MS,
      async () => {
        if ((await gameNow(api, game.id))?.openedIds.includes(bot.id)) return;
        await api.as(bot.id, {
          method: "POST",
          path: `${gamePath(game.id)}/open`,
        });
        buyLater(api, bot, game.id, game.title);
      },
      `santa:open:${game.id}:${bot.id}`,
    );
  }
};

export const santaBehavior: BotBehavior = {
  "santa:created": (api, event) => joinInvited(api, event.id),
  "santa:drawn": (api, event) => openAndBuy(api, event.id),
  // Вкладку перезагрузили или боты перешли к другой вкладке — отложенные
  // шаги пропали. Досылаем их по базе: иначе игра навсегда «Участники 1».
  resume: async (api) => {
    const db = await api.db.read();
    for (const game of Object.values(db.santaGames)) {
      if (game.status === "gathering") await joinInvited(api, game.id);
      else await openAndBuy(api, game.id);
    }
  },
};
