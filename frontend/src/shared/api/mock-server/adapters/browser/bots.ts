import { getRealtime } from "@/shared/lib/realtime";

import { createDefaultBotEngine } from "../../bots";
import { getBrowserMockServer } from "./index";

// Боты в режиме local исполняет одна вкладка-лидер (TECH_SPEC §7): та, что
// держит замок `swipeit-bots`. Закрыли лидера — браузер отдаёт замок
// следующей вкладке, и боты продолжают там. Без замка три вкладки утроили бы
// каждое действие ботов.
const LOCK_NAME = "swipeit-bots";

let started = false;
let leader = false;
const listeners = new Set<() => void>();

export const isBotLeader = () => leader;

export const subscribeBotLeader = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const startBrowserBots = () => {
  if (started || typeof window === "undefined") return;
  started = true;
  const server = getBrowserMockServer();
  const realtime = getRealtime();
  const engine = createDefaultBotEngine({
    clock: server.deps.clock,
    db: server.deps.db,
    // Боты ходят в обработчики напрямую: задержки и «случайные ошибки» из
    // демо-панели — для интерфейса человека, не для ботов.
    handle: (request) => server.handle(request),
    publish: (event) => realtime.publish(event),
    random: server.deps.random,
    settings: server.deps.settings,
    subscribe: (handler) => realtime.subscribe(handler),
  });
  const becomeLeader = () => {
    leader = true;
    listeners.forEach((listener) => listener());
    engine.start();
  };
  if (!navigator.locks) {
    // Без Web Locks (очень старый браузер) лидера не выбрать — пусть боты
    // живут в каждой вкладке: лучше дубль, чем тишина.
    becomeLeader();
    return;
  }
  void navigator.locks
    .request(LOCK_NAME, { mode: "exclusive" }, () => {
      becomeLeader();
      // Замок держим, пока вкладка жива.
      return new Promise<void>(() => undefined);
    })
    .catch(() => undefined);
};
