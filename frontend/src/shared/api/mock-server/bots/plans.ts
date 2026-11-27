import type { Activity } from "../../catalog/types";
import type { PlanView } from "../../plans/types";
import type { User } from "../../users/types";
import type { BotApi, BotBehavior } from "./engine";

// Боты в «Че делать будем?» (TECH_SPEC §7). В лобби бот-участник жмёт
// «Готов» через 1–4 с (× скорость ботов и темп бота) — через тот же
// POST /plans/:id/ready, что и человек. После старта — свайпает колоду
// через POST /plans/:id/swipes.
const READY_DELAY_MS: [number, number] = [1_000, 4_000];

// Задержка на карточку в «Прямо сейчас» (TECH_SPEC §7): «Нормально» —
// 1–2.5 с × темп бота. «Медленно» ×2 и «Быстро» ×0.3 добавляет движок:
// 0.3–0.75 с × темп — это и есть «Быстро 0.3–0.8 с» из спецификации.
const CARD_DELAY_MS: [number, number] = [1_000, 2_500];

// Шансы лайка: база бота, +0.35 за любимую категорию (TECH_SPEC §5
// BotProfile), немного — за «Недорого». Потолок — чтобы и любимое иногда
// уходило влево, а совпадения не были гарантированы.
const FAVOURITE_BONUS = 0.35;
const CHEAP_BONUS = 0.1;
const MAX_LIKE = 0.95;

// Род — по «Показывать подарки» бота, как в ленте броней.
const byGender = (bot: User, male: string, female: string, any: string) =>
  bot.audience === "female" ? female : bot.audience === "male" ? male : any;

const readyWord = (bot: User) => byGender(bot, "готов", "готова", "готов(а)");

const likeChance = (bot: User, activity: Activity) => {
  const profile = bot.bot;
  let chance = profile?.likeProbability ?? 0.5;
  const favourites: readonly string[] = profile?.likesCategories ?? [];
  if (favourites.includes(activity.category)) chance += FAVOURITE_BONUS;
  if (activity.tags.includes("cheap")) chance += CHEAP_BONUS;
  return Math.min(chance, MAX_LIKE);
};

// Бот свайпает колоду по карточке: следующая планируется только после
// ответа на предыдущую — темп ровный, и выключение «Скорости ботов» или
// остановка движка обрывают цепочку на ближайшем шаге.
const swipeDeck = (
  api: BotApi,
  bot: User,
  planId: string,
  cards: Activity[],
) => {
  const path = `/plans/${encodeURIComponent(planId)}`;
  const step = () =>
    api.schedule(bot, CARD_DELAY_MS, async () => {
      const db = await api.db.read();
      const plan = db.plans[planId];
      // План перешёл к результатам или бота убрали — свайпать нечего.
      if (plan?.status !== "swiping") return;
      if (!plan.participantIds.includes(bot.id)) return;
      if (plan.finishedIds.includes(bot.id)) return;
      const mine = plan.swipes[bot.id] ?? {};
      const card = cards.find((activity) => mine[activity.id] === undefined);
      if (!card) return;
      const decision =
        api.random.next() < likeChance(bot, card) ? "like" : "pass";
      const view = await api.as<PlanView>(bot.id, {
        method: "POST",
        path: `${path}/swipes`,
        body: { activityId: card.id, decision },
      });
      // В ленту — только итог, а не каждый свайп: иначе она тонет.
      if (view.plan.finishedIds.includes(bot.id)) {
        api.report(
          bot.id,
          `${bot.name} ${byGender(bot, "досвайпал", "досвайпала", "досвайпал(а)")} колоду в плане «${view.plan.title}»`,
        );
        return;
      }
      step();
    });
  step();
};

export const plansBehavior: BotBehavior = {
  "plan:created": async (api, event) => {
    const db = await api.db.read();
    const plan = db.plans[event.id];
    // «До даты» лобби не имеет — там боты начинают с plan:started.
    if (!plan || plan.status !== "lobby") return;
    const bots = plan.participantIds
      .map((id) => db.users[id])
      .filter(
        (user): user is User =>
          Boolean(user?.isBot) && !plan.readyIds.includes(user?.id ?? ""),
      );
    for (const bot of bots) {
      api.schedule(bot, READY_DELAY_MS, async () => {
        // План могли запустить или удалить, пока бот «думал», — тогда
        // обработчик ответит ошибкой, и строки в ленте не будет.
        await api.as(bot.id, {
          method: "POST",
          path: `/plans/${encodeURIComponent(plan.id)}/ready`,
          body: { ready: true },
        });
        api.report(
          bot.id,
          `${bot.name} ${readyWord(bot)} в плане «${plan.title}»`,
        );
      });
    }
  },
  // «Прямо сейчас»: каждый бот-участник свайпает колоду в своём темпе.
  "plan:started": async (api, event) => {
    const db = await api.db.read();
    const plan = db.plans[event.id];
    if (!plan || plan.status !== "swiping") return;
    // TODO(T15): «До даты» — боты проходят колоду в случайные моменты до
    // дедлайна в масштабе перемотки часов (TECH_SPEC §7). POST /plans уже
    // шлёт plan:started для этого режима.
    if (plan.mode !== "live") return;
    const bots = plan.participantIds
      .map((id) => db.users[id])
      .filter((user): user is User => Boolean(user?.isBot));
    const first = bots[0];
    if (!first) return;
    // Колода с данными занятий (категория, метки) — через тот же GET, что
    // у людей: каталога в базе нет. Порядок общий, поэтому запрос один.
    const view = await api.as<PlanView>(first.id, {
      method: "GET",
      path: `/plans/${encodeURIComponent(plan.id)}`,
    });
    for (const bot of bots) swipeDeck(api, bot, plan.id, view.activities);
  },
};
