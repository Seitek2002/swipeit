import { reconnectDelay } from "./backoff";
import { setConnectionStatus } from "./connection";
import type { Realtime, RealtimeEvent } from "./types";

const EVENT = "realtime";
// Сервер remote закрывает сокет с этим кодом, если hello не пришёл или токен
// неверный (BACKEND.md §5).
const WS_UNAUTHORIZED = 4401;

type SocketOptions = {
  // Первое сообщение после открытия. null — подключаться пока не с чем
  // (remote без токена: профиль ещё создаётся).
  hello: () => null | Record<string, unknown>;
  // Разброс задержки переподключения (remote — ±20%, §5).
  jitter: number;
  // Когда связь считается есть: lan — сразу на open, remote — на ready
  // (после проверки токена: иначе неверный токен мигал бы «Снова в сети»).
  onlineOn: "open" | "ready";
  // Сервер закрыл с 4401 — сессия закончилась, переподключаться бессмысленно.
  onUnauthorized?: () => void;
  // Вернулись во вкладку — переподключиться сразу, не дожидаясь паузы.
  reconnectOnVisible: boolean;
};

type SocketBus = Realtime & {
  // Переподключиться заново (сменился токен) — без паузы.
  reconnect(): void;
  // Повторить hello в открытом сокете (lan: сменился пользователь вкладки).
  resendHello(): void;
};

// Шина поверх WebSocket: события приходят с сервера. После обрыва —
// переподключение с паузой; вернувшись, вкладка перечитывает всё (могла
// пропустить события) — это делает подписчик статуса связи (providers).
const createSocketBus = (url: string, options: SocketOptions): SocketBus => {
  const target = new EventTarget();
  let socket: null | WebSocket = null;
  let attempt = 0;
  let retryTimer: null | ReturnType<typeof setTimeout> = null;

  const emit = (event: RealtimeEvent) =>
    target.dispatchEvent(
      new CustomEvent<RealtimeEvent>(EVENT, { detail: event }),
    );

  const clearRetry = () => {
    if (retryTimer !== null) clearTimeout(retryTimer);
    retryTimer = null;
  };

  const sendHello = (ws: WebSocket) => {
    const hello = options.hello();
    if (hello && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(hello));
    }
  };

  const connect = () => {
    clearRetry();
    if (!options.hello()) return;
    const ws = new WebSocket(url);
    socket = ws;
    ws.addEventListener("open", () => {
      if (socket !== ws) return;
      if (options.onlineOn === "open") {
        attempt = 0;
        setConnectionStatus("online");
      }
      sendHello(ws);
    });
    ws.addEventListener("message", (message: MessageEvent<string>) => {
      if (socket !== ws) return;
      let data: { type?: unknown } | null = null;
      try {
        data = JSON.parse(message.data) as { type?: unknown };
      } catch {
        // Не наше сообщение — пропускаем.
        return;
      }
      // ready — ответ на hello, а не событие шины (§5).
      if (data?.type === "ready") {
        attempt = 0;
        setConnectionStatus("online");
        return;
      }
      emit(data as RealtimeEvent);
    });
    ws.addEventListener("close", (event) => {
      // Сокет заменили (reconnect) — его закрытие уже не наше дело.
      if (socket !== ws) return;
      socket = null;
      if (event.code === WS_UNAUTHORIZED && options.onUnauthorized) {
        options.onUnauthorized();
        return;
      }
      setConnectionStatus("offline");
      retryTimer = setTimeout(connect, reconnectDelay(attempt, options.jitter));
      attempt += 1;
    });
  };

  if (options.reconnectOnVisible && typeof document !== "undefined") {
    document.addEventListener("visibilitychange", () => {
      // Ждём паузу после обрыва — не ждём: телефон мог спать, а человек
      // уже смотрит на экран.
      if (document.visibilityState === "visible" && retryTimer !== null) {
        connect();
      }
    });
  }

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
    reconnect() {
      const previous = socket;
      socket = null;
      previous?.close();
      attempt = 0;
      connect();
    },
    resendHello() {
      if (socket) sendHello(socket);
    },
  };
};

export type WsRealtime = Realtime & {
  // Кто сидит во вкладке — для онлайна в «В этой сети».
  setUserId(userId: null | string): void;
};

// Шина режима lan: WebSocket /ws ноутбука, hello { userId } (TECH_SPEC §7a).
// Сменился пользователь вкладки — тот же сокет, новый hello.
export const createWsRealtime = (url: string): WsRealtime => {
  let userId: null | string = null;
  const bus = createSocketBus(url, {
    hello: () => ({ type: "hello", userId }),
    jitter: 0,
    onlineOn: "open",
    reconnectOnVisible: false,
  });
  return {
    publish: bus.publish,
    subscribe: bus.subscribe,
    setUserId(next) {
      userId = next;
      bus.resendHello();
    },
  };
};

export type RemoteRealtime = Realtime & {
  // Сменился токен (создали профиль, вышли) — новый сокет с новым hello.
  reconnect(): void;
};

// Шина режима remote: /v1/ws сервера, первым сообщением hello { token }
// (BACKEND.md §5: заголовок в браузерном WebSocket не поставить, а токен в
// адресе попал бы в логи). Пауза 1 → 2 → 4 → 8 с ±20%, при возвращении во
// вкладку — сразу.
export const createRemoteRealtime = (
  url: string,
  {
    getToken,
    onUnauthorized,
  }: { getToken: () => null | string; onUnauthorized: () => void },
): RemoteRealtime => {
  const bus = createSocketBus(url, {
    hello: () => {
      const token = getToken();
      return token ? { type: "hello", token } : null;
    },
    jitter: 0.2,
    onlineOn: "ready",
    onUnauthorized,
    reconnectOnVisible: true,
  });
  return {
    publish: bus.publish,
    subscribe: bus.subscribe,
    reconnect: bus.reconnect,
  };
};
