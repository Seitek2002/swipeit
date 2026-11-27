import type { RealtimeEvent } from "@swipeit/core/realtime/types";

// Хаб событий (BACKEND.md §5): события доставляются после commit. WebSocket
// и адресаты — в B12. До тех пор рабочий хаб события никуда не шлёт и не
// хранит (ревью R4: копились в памяти навсегда), а тестовый — записывает.
export type EventHub = {
  deliver: (events: readonly RealtimeEvent[]) => void;
};

export const createEventHub = (): EventHub => ({
  deliver: () => undefined,
});

// Хаб для тестов: всё доставленное — в delivered.
export const createRecordingHub = (): EventHub & {
  delivered: RealtimeEvent[];
} => {
  const delivered: RealtimeEvent[] = [];
  return {
    delivered,
    deliver: (events) => {
      delivered.push(...events);
    },
  };
};
