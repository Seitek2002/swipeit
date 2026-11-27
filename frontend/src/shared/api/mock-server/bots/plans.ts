import type { User } from "../../users/types";
import type { BotBehavior } from "./engine";

// Боты в «Че делать будем?» (TECH_SPEC §7). В лобби бот-участник жмёт
// «Готов» через 1–4 с (× скорость ботов и темп бота) — через тот же
// POST /plans/:id/ready, что и человек.
const READY_DELAY_MS: [number, number] = [1_000, 4_000];

// Род — по «Показывать подарки» бота, как в ленте броней.
const readyWord = (bot: User) =>
  bot.audience === "female"
    ? "готова"
    : bot.audience === "male"
      ? "готов"
      : "готов(а)";

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
  // Свайп колоды в своём темпе («Прямо сейчас») и в случайные моменты до
  // дедлайна («До даты») — T14/T15. Хук уже вызывается из /plans/:id/start
  // и из POST /plans для режима «До даты».
  "plan:started": () => undefined,
};
