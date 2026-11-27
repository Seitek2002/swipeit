// Шина событий реального времени (TECH_SPEC §7). Типы — отдельно от
// реализаций: их импортирует изоморфный мок-сервер, которому нельзя тянуть
// за собой BroadcastChannel и WebSocket.

export type RealtimeScope =
  | "plans"
  | "reservations"
  | "santa"
  | "settings"
  | "swipes"
  | "users"
  | "wishlist";

// Доменные события, на которые реагируют боты (T12): «вишлист отправлен»,
// «план запущен», «игра Санты создана»… Список растёт вместе с задачами.
export type BotTrigger =
  | "plan:created"
  | "plan:started"
  | "santa:created"
  | "santa:drawn"
  | "wishlist:shared";

export type RealtimeEvent =
  | { activityId: string; planId: string; type: "plan:match" }
  | { at: number; botId: string; text: string; type: "bot:action" }
  | { by: string; id: string; name: BotTrigger; type: "trigger" }
  | { by: string; id?: string; scope: RealtimeScope[]; type: "db:changed" }
  // Расширение TECH_SPEC §7. Триггер для ботов: id — чего касается (владелец
  // вишлиста, план, игра), by — кто сделал.
  | {
      done: number;
      planId: string;
      total: number;
      type: "plan:progress";
      userId: string;
    }
  // Что сделал бот — в ленту демо-панели, а не тостом владельцу (TASKS T12).
  | { forUserId?: string; text: string; type: "toast" };

export type Realtime = {
  publish(event: RealtimeEvent): void;
  subscribe(handler: (event: RealtimeEvent) => void): () => void;
};

export const ALL_SCOPES: RealtimeScope[] = [
  "plans",
  "reservations",
  "santa",
  "settings",
  "swipes",
  "users",
  "wishlist",
];
