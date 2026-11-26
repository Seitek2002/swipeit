import type { Realtime, RealtimeEvent } from "./types";

const CHANNEL = "swipeit";
const STORAGE_KEY = "swipeit:bus";
const EVENT = "realtime";

// Реализация шины для режима local (TECH_SPEC §7): EventTarget внутри
// вкладки + BroadcastChannel между вкладками. BroadcastChannel не доставляет
// сообщение отправителю — поэтому своей вкладке событие отдаём через
// EventTarget. Где BroadcastChannel нет — запасной путь через событие storage.
export const createLocalRealtime = (): Realtime => {
  const target = new EventTarget();
  const emit = (event: RealtimeEvent) =>
    target.dispatchEvent(
      new CustomEvent<RealtimeEvent>(EVENT, { detail: event }),
    );

  const channel =
    typeof BroadcastChannel !== "undefined"
      ? new BroadcastChannel(CHANNEL)
      : null;

  if (channel) {
    channel.addEventListener(
      "message",
      (message: MessageEvent<RealtimeEvent>) => emit(message.data),
    );
  } else {
    window.addEventListener("storage", (event) => {
      if (event.key !== STORAGE_KEY || !event.newValue) return;
      try {
        emit((JSON.parse(event.newValue) as { event: RealtimeEvent }).event);
      } catch {
        // Чужая или битая запись — пропускаем.
      }
    });
  }

  return {
    publish(event) {
      emit(event);
      if (channel) {
        channel.postMessage(event);
        return;
      }
      try {
        // Случайный хвост — чтобы одинаковые события тоже вызывали storage.
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ event, n: Math.random() }),
        );
      } catch {
        // Без хранилища другие вкладки не узнают — своя всё равно обновится.
      }
    },
    subscribe(handler) {
      const listener = (event: Event) =>
        handler((event as CustomEvent<RealtimeEvent>).detail);
      target.addEventListener(EVENT, listener);
      return () => target.removeEventListener(EVENT, listener);
    },
  };
};
