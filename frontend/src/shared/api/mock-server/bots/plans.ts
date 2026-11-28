import type { Activity } from "../../catalog/types";
import { voteCandidates } from "../../plans/matches";
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

// «До даты» (TECH_SPEC §7): бот «заходит» в план не сразу и свайпает
// неспешно — 5–30 с до первой карточки, 4–15 с на карточку (× скорость и
// темп). Таймеры настоящие и перемотку часов не догоняют: перемотали за
// дедлайн — планировщик закроет план с тем, что боты успели, а следующий
// свайп бота сервер отклонит.
const DEADLINE_START_MS: [number, number] = [5_000, 30_000];
const DEADLINE_CARD_DELAY_MS: [number, number] = [4_000, 15_000];

type Pace = { card: [number, number]; start: [number, number] };

const LIVE_PACE: Pace = { start: CARD_DELAY_MS, card: CARD_DELAY_MS };
const DEADLINE_PACE: Pace = {
  start: DEADLINE_START_MS,
  card: DEADLINE_CARD_DELAY_MS,
};

// Поколение цепочки свайпов бота в плане. «Добавить ещё занятий» шлёт
// plan:started повторно: новая цепочка берёт следующий номер, а старая (бот
// мог быть посреди колоды) на ближайшем шаге видит, что устарела, и
// останавливается — иначе бот свайпал бы вдвое быстрее. Номер, а не набор
// «бегущих»: цепочку молча обрывает выключение ботов, и запись о ней не
// должна мешать следующей. По api — у каждого движка свой счёт.
const chains = new WeakMap<BotApi, Map<string, number>>();

const claimChain = (api: BotApi, key: string) => {
  const generations = chains.get(api) ?? new Map<string, number>();
  chains.set(api, generations);
  const generation = (generations.get(key) ?? 0) + 1;
  generations.set(key, generation);
  return () => generations.get(key) === generation;
};

// Шансы лайка: база бота, +0.35 за любимую категорию (TECH_SPEC §5
// BotProfile), немного — за «Недорого». Потолок — чтобы и любимое иногда
// уходило влево, а совпадения не были гарантированы. Экспорт — для
// сценария «Новый год»: там боты «уже досвайпали» по тем же шансам.
const FAVOURITE_BONUS = 0.35;
const CHEAP_BONUS = 0.1;
const MAX_LIKE = 0.95;

// Род — по «Показывать подарки» бота, как в ленте броней.
const byGender = (bot: User, male: string, female: string, any: string) =>
  bot.audience === "female" ? female : bot.audience === "male" ? male : any;

// Род неизвестен («всем») — фраза без рода, а не «готов(а)» (P11).
const readyLine = (bot: User, title: string) =>
  bot.audience === "all"
    ? `План «${title}»: ${bot.name} — готово`
    : `${bot.name} ${byGender(bot, "готов", "готова", "")} в плане «${title}»`;

export const likeChance = (bot: User, activity: Activity) => {
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
  pace: Pace,
) => {
  const path = `/plans/${encodeURIComponent(planId)}`;
  const isCurrent = claimChain(api, `${planId}:${bot.id}`);
  const step = (range: [number, number]) =>
    api.schedule(bot, range, async () => {
      if (!isCurrent()) return;
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
      let view: PlanView;
      try {
        view = await api.as<PlanView>(bot.id, {
          method: "POST",
          path: `${path}/swipes`,
          body: { activityId: card.id, decision },
        });
      } catch {
        // Сбой одного свайпа не обрывает цепочку: следующий шаг попробует
        // снова, а если план уже закрыт — остановится на проверке выше.
        step(pace.card);
        return;
      }
      // В ленту — только итог, а не каждый свайп: иначе она тонет.
      if (view.plan.finishedIds.includes(bot.id)) {
        api.report(
          bot.id,
          bot.audience === "all"
            ? `План «${view.plan.title}»: ${bot.name} — колода пройдена`
            : `${bot.name} ${byGender(bot, "досвайпал", "досвайпала", "")} колоду в плане «${view.plan.title}»`,
        );
        return;
      }
      step(pace.card);
    });
  step(pace.start);
};

// Каждый бот-участник, который ещё не досвайпал, свайпает колоду в своём
// темпе: «Прямо сейчас» — бодро, «До даты» — неспешно. Повторный старт
// («Добавить ещё занятий», продолжение после перезапуска) берёт новое
// поколение цепочки — старая сама остановится.
const startSwiping = async (api: BotApi, planId: string) => {
  const db = await api.db.read();
  const plan = db.plans[planId];
  if (!plan || plan.status !== "swiping") return;
  const bots = plan.participantIds
    .map((id) => db.users[id])
    .filter(
      (user): user is User =>
        Boolean(user?.isBot) && !plan.finishedIds.includes(user?.id ?? ""),
    );
  const first = bots[0];
  if (!first) return;
  // Колода с данными занятий (категория, метки) — через тот же GET, что
  // у людей: каталога в базе нет. Порядок общий, поэтому запрос один.
  const view = await api.as<PlanView>(first.id, {
    method: "GET",
    path: `/plans/${encodeURIComponent(plan.id)}`,
  });
  const pace = plan.mode === "live" ? LIVE_PACE : DEADLINE_PACE;
  for (const bot of bots) {
    swipeDeck(api, bot, plan.id, view.activities, pace);
  }
};

// Боты-участники лобби жмут «Готов» через 1–4 с.
const readyUp = async (api: BotApi, planId: string) => {
  const db = await api.db.read();
  const plan = db.plans[planId];
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
      // Уже готов (повторное продолжение после смены лидера или настроек)
      // — второй строки в ленте не нужно.
      const now = (await api.db.read()).plans[plan.id];
      if (now?.status !== "lobby" || now.readyIds.includes(bot.id)) return;
      // План могли запустить или удалить, пока бот «думал», — тогда
      // обработчик ответит ошибкой, и строки в ленте не будет.
      await api.as(bot.id, {
        method: "POST",
        path: `/plans/${encodeURIComponent(plan.id)}/ready`,
        body: { ready: true },
      });
      api.report(bot.id, readyLine(bot, plan.title));
    });
  }
};

// Бот голосует в «Выбрать самим» через 3–15 с: за то, что сам лайкнул среди
// кандидатов, иначе — за любого кандидата (auto-tasks U07). Уже
// проголосовавших не трогаем; повтор (resume, новый голос) безопасен — у
// шага ключ.
const VOTE_DELAY_MS: [number, number] = [3_000, 15_000];

const voteLater = async (api: BotApi, planId: string) => {
  const db = await api.db.read();
  const plan = db.plans[planId];
  if (!plan || plan.status !== "results") return;
  if (Object.keys(plan.votes).length === 0) return;
  const bots = plan.participantIds
    .filter((id) => !(id in plan.votes))
    .map((id) => db.users[id])
    .filter((user): user is User => Boolean(user?.isBot));
  for (const bot of bots) {
    api.schedule(
      bot,
      VOTE_DELAY_MS,
      async () => {
        const fresh = (await api.db.read()).plans[planId];
        if (!fresh || fresh.status !== "results" || bot.id in fresh.votes) {
          return;
        }
        const candidates = voteCandidates(fresh);
        const liked = candidates.filter(
          (id) => fresh.swipes[bot.id]?.[id] === "like",
        );
        const pool = liked.length > 0 ? liked : candidates;
        const activityId = pool[api.random.int(pool.length)];
        if (!activityId) return;
        await api.as(bot.id, {
          method: "POST",
          path: `/plans/${encodeURIComponent(planId)}/votes`,
          body: { activityId },
        });
        api.report(
          bot.id,
          bot.audience === "all"
            ? `«${fresh.title}»: ${bot.name} — голос отдан`
            : `${bot.name} ${byGender(bot, "проголосовал", "проголосовала", "")} в «${fresh.title}»`,
        );
      },
      `plan:vote:${planId}:${bot.id}`,
    );
  }
};

export const plansBehavior: BotBehavior = {
  "plan:voted": (api, event) => voteLater(api, event.id),
  "plan:created": (api, event) => readyUp(api, event.id),
  // Каждый бот-участник свайпает колоду в своём темпе: «Прямо сейчас» —
  // бодро, «До даты» — неспешно. Повторный plan:started («Добавить ещё
  // занятий») — бот досвайпывает новые карточки.
  "plan:started": (api, event) => startSwiping(api, event.id),
  // Движок запустился заново или боты снова включены — досвайпать начатые
  // планы (цепочки в таймерах прошлого лидера потерялись).
  resume: async (api) => {
    const db = await api.db.read();
    for (const plan of Object.values(db.plans)) {
      if (plan.status === "lobby") {
        await readyUp(api, plan.id).catch(() => undefined);
        continue;
      }
      if (plan.status === "results") {
        await voteLater(api, plan.id).catch(() => undefined);
        continue;
      }
      if (plan.status !== "swiping") continue;
      const unfinished = plan.participantIds.some(
        (id) => db.users[id]?.isBot && !plan.finishedIds.includes(id),
      );
      if (unfinished) await startSwiping(api, plan.id).catch(() => undefined);
    }
  },
};
