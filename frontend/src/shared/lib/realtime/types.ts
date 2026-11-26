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

export type RealtimeEvent =
  | { activityId: string; planId: string; type: "plan:match" }
  | { by: string; id?: string; scope: RealtimeScope[]; type: "db:changed" }
  | {
      done: number;
      planId: string;
      total: number;
      type: "plan:progress";
      userId: string;
    }
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
