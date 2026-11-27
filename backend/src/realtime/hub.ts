import type { RealtimeEvent } from "@swipeit/core/realtime/types";

// Хаб событий (BACKEND.md §5). Пока — запись в память для тестов: события
// доставляются после commit. WebSocket и адресаты — в B12.
export type EventHub = {
  deliver: (events: readonly RealtimeEvent[]) => void;
  delivered: RealtimeEvent[];
};

export const createEventHub = (): EventHub => {
  const delivered: RealtimeEvent[] = [];
  return {
    delivered,
    deliver: (events) => {
      delivered.push(...events);
    },
  };
};
