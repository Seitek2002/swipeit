import type { BotTrigger, RealtimeEvent } from "@/shared/lib/realtime/types";

import type { DemoSettings } from "../../demo/types";
import type { User } from "../../users/types";
import type { Clock, DbAccess, SettingsAccess } from "../context";
import type { Random } from "../random";
import type { MockRequest } from "../server";

// Движок ботов (TECH_SPEC §7). Бот — обычный пользователь `isBot: true`,
// и действует он только через обработчики мок-сервера, как человек: никаких
// прямых записей в базу. Движок изоморфный: в local его запускает одна
// вкладка-лидер, в lan — LAN-сервер (T12b).

export type BotScheduler = {
  // Выполнить задачу через ms; вернуть отмену.
  after(ms: number, task: () => void): () => void;
};

export type BotApi = {
  // Запрос от имени бота — те же маршруты, что у людей.
  as<T>(botId: string, request: Omit<MockRequest, "userId">): Promise<T>;
  clock: Clock;
  db: Pick<DbAccess, "read">;
  random: Random;
  // Строка в ленту демо-панели: «Азамат забронировал подарок».
  report(botId: string, text: string): void;
  // Задержка с учётом «Скорости ботов» и темпа бота; null — боты выключены.
  // key — шаг с этим ключом уже ждёт: повтор (resume) не ставим.
  schedule(
    bot: User,
    range: [number, number],
    task: () => Promise<void>,
    key?: string,
  ): void;
  settings(): DemoSettings;
};

// Поведение — набор хуков на триггеры. Вишлист — сейчас; планы и Санта
// допишутся в T14 и T17 своими поведениями.
export type BotBehavior = Partial<
  Record<BotTrigger, (api: BotApi, event: TriggerEvent) => Promise<void> | void>
> & {
  // Продолжить начатое: движок запустился (вкладка стала лидером, сервер
  // перезапущен) или боты снова включены. Цепочки действий живут в таймерах
  // и при этом теряются — без продолжения план «Прямо сейчас» ждал бы
  // ботов вечно.
  resume?: (api: BotApi) => Promise<void> | void;
};

export type TriggerEvent = Extract<RealtimeEvent, { type: "trigger" }>;

export type BotEngineDeps = {
  behaviors: BotBehavior[];
  clock: Clock;
  db: Pick<DbAccess, "read">;
  handle(request: MockRequest): Promise<unknown>;
  publish(event: RealtimeEvent): void;
  random: Random;
  scheduler?: BotScheduler;
  settings: Pick<SettingsAccess, "get">;
  subscribe(handler: (event: RealtimeEvent) => void): () => void;
};

export type BotEngine = { start(): void; stop(): void };

// «Медленно» ×2, «Быстро» — примерно втрое быстрее (TECH_SPEC §7).
const SPEED: Record<DemoSettings["botSpeed"], null | number> = {
  slow: 2,
  normal: 1,
  fast: 0.3,
  off: null,
};

const timerScheduler: BotScheduler = {
  after(ms, task) {
    const timer = setTimeout(task, ms);
    return () => clearTimeout(timer);
  },
};

export const createBotEngine = (deps: BotEngineDeps): BotEngine => {
  const scheduler = deps.scheduler ?? timerScheduler;
  const pending = new Set<() => void>();
  // Ключи шагов, которые ждут своего часа (для schedule с key).
  const waitingKeys = new Set<string>();
  let unsubscribe: (() => void) | null = null;

  const api: BotApi = {
    as: (botId, request) =>
      deps.handle({ ...request, userId: botId }) as Promise<never>,
    clock: deps.clock,
    db: deps.db,
    random: deps.random,
    settings: () => deps.settings.get(),
    report: (botId, text) =>
      deps.publish({ type: "bot:action", botId, text, at: deps.clock.now() }),
    schedule(bot, [min, max], task, key) {
      const factor = SPEED[deps.settings.get().botSpeed];
      if (factor === null) return;
      if (key !== undefined) {
        if (waitingKeys.has(key)) return;
        waitingKeys.add(key);
      }
      const pace = bot.bot?.speedFactor ?? 1;
      const delay = (min + deps.random.next() * (max - min)) * factor * pace;
      const cancel = scheduler.after(delay, () => {
        pending.delete(cancel);
        if (key !== undefined) waitingKeys.delete(key);
        // Скорость могли выключить, пока бот «думал».
        if (SPEED[deps.settings.get().botSpeed] === null) return;
        // Ошибка бота (подарок уже забрали, сеть) — не повод ронять вкладку.
        task().catch(() => undefined);
      });
      pending.add(cancel);
    },
  };

  const resumeAll = () => {
    for (const behavior of deps.behaviors) {
      if (!behavior.resume) continue;
      Promise.resolve(behavior.resume(api)).catch(() => undefined);
    }
  };

  const onEvent = (event: RealtimeEvent) => {
    // Поменяли настройки демо и боты не «Выкл» — продолжить начатое (после
    // «Выкл» цепочки оборвались). Повторный запуск безопасен: у цепочек
    // поколения, старая сама остановится.
    if (event.type === "db:changed" && event.scope.includes("settings")) {
      if (SPEED[deps.settings.get().botSpeed] !== null) resumeAll();
      return;
    }
    if (event.type !== "trigger") return;
    for (const behavior of deps.behaviors) {
      const hook = behavior[event.name];
      if (!hook) continue;
      Promise.resolve(hook(api, event)).catch(() => undefined);
    }
  };

  return {
    start() {
      if (unsubscribe) return;
      unsubscribe = deps.subscribe(onEvent);
      resumeAll();
    },
    stop() {
      unsubscribe?.();
      unsubscribe = null;
      pending.forEach((cancel) => cancel());
      pending.clear();
      waitingKeys.clear();
    },
  };
};
