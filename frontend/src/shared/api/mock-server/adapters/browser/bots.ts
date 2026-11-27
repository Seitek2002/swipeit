import { getRealtime } from "@/shared/lib/realtime";

import { setBotLeader } from "../../../browser-bots";
import { createDefaultBotEngine } from "../../bots";
import { getBrowserMockServer } from "./index";

// Боты в режиме local исполняет одна вкладка-лидер (TECH_SPEC §7): та, что
// держит замок `swipeit-bots`. Закрыли лидера — браузер отдаёт замок
// следующей вкладке, и боты продолжают там. Без замка три вкладки утроили бы
// каждое действие ботов.
const LOCK_NAME = "swipeit-bots";

// Признак лидерства — в shared/api/browser-bots: демо-панель читает его,
// не загружая мок-сервер.
let started = false;

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
    setBotLeader(true);
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
