// Боты режима local (TECH_SPEC §7) — лёгкая часть: просьба их запустить и
// признак лидерства для демо-панели. Сам движок живёт в мок-сервере
// (mock-server/adapters/browser/bots.ts) и грузится вместе с ним.
//
// Почему не запускать сразу: движку нужен мок-сервер, а тот при первом
// обращении строит базу из каталога (products.json ~190 КБ, разбор zod).
// На онбординге и «Авторах фото» до первого действия человека в базу никто
// не ходит — и этот модуль не тянет мок-сервер в общий бандл, а боты
// стартуют вместе с первым запросом к моку (transport.ts). Ботам до этого
// делать нечего: их будят запросы людей, а начатое продолжает resume.

let requested = false;
let serverLoaded = false;
let leader = false;
const listeners = new Set<() => void>();

type BotsModule = { startBrowserBots: () => void };

const launch = () => {
  void import("./mock-server/adapters/browser").then((module: BotsModule) =>
    module.startBrowserBots(),
  );
};

// Вкладка в режиме local хочет ботов (app/providers). Мок-сервер уже
// загружен — запускаем, иначе — с первым запросом к нему.
export const startBrowserBots = () => {
  if (typeof window === "undefined") return;
  requested = true;
  if (serverLoaded) launch();
};

// Зовёт мок-транспорт, загрузив мок-сервер. Модуль уже в памяти — запуск
// синхронный, до обработки самого запроса, как и было при старте вкладки.
export const onMockServerLoaded = (module: BotsModule) => {
  serverLoaded = true;
  if (requested) module.startBrowserBots();
};

export const isBotLeader = () => leader;

export const setBotLeader = (value: boolean) => {
  leader = value;
  listeners.forEach((listener) => listener());
};

export const subscribeBotLeader = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};
