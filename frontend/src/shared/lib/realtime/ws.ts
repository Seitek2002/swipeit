import { setConnectionStatus } from "./connection";
import type { Realtime, RealtimeEvent } from "./types";

const EVENT = "realtime";
// Переподключение 1 → 2 → 4 → 8 с, дальше каждые 8 с (TECH_SPEC §7).
const BACKOFF_MS = [1000, 2000, 4000, 8000];

export type WsRealtime = Realtime & {
  // Кто сидит во вкладке — для онлайна в «В этой сети».
  setUserId(userId: null | string): void;
};

// Шина режима lan: события приходят с сервера по WebSocket /ws. После
// обрыва — переподключение; вернувшись, вкладка перечитывает всё (могла
// пропустить события) — это делает подписчик статуса связи.
export const createWsRealtime = (url: string): WsRealtime => {
  const target = new EventTarget();
  let socket: null | WebSocket = null;
  let attempt = 0;
  let userId: null | string = null;

  const emit = (event: RealtimeEvent) =>
    target.dispatchEvent(
      new CustomEvent<RealtimeEvent>(EVENT, { detail: event }),
    );

  const hello = () => {
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "hello", userId }));
    }
  };

  const connect = () => {
    socket = new WebSocket(url);
    socket.addEventListener("open", () => {
      attempt = 0;
      setConnectionStatus("online");
      hello();
    });
    socket.addEventListener("message", (message: MessageEvent<string>) => {
      try {
        emit(JSON.parse(message.data) as RealtimeEvent);
      } catch {
        // Не наше сообщение — пропускаем.
      }
    });
    socket.addEventListener("close", () => {
      setConnectionStatus("offline");
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      setTimeout(connect, delay);
    });
  };

  connect();

  return {
    // Клиент ничего не рассылает другим: изменения идут через API, события
    // рассылает сервер. Своей вкладке — доставить.
    publish: emit,
    subscribe(handler) {
      const listener = (event: Event) =>
        handler((event as CustomEvent<RealtimeEvent>).detail);
      target.addEventListener(EVENT, listener);
      return () => target.removeEventListener(EVENT, listener);
    },
    setUserId(next) {
      userId = next;
      hello();
    },
  };
};
