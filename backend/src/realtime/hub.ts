import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";

import type { RealtimeEvent } from "@swipeit/core/realtime/types";
import { type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

// Хаб событий (BACKEND.md §5, B12): события уходят после commit и только
// адресатам — userId → открытые сокеты (все устройства человека). Событие —
// подсказка «перечитай»: без данных и без поля by (в событии брони оно
// выдало бы бронирующего).

export type AddressedEvent = { event: RealtimeEvent; to: readonly string[] };

export type EventHub = {
  deliver: (events: readonly AddressedEvent[]) => void;
};

// Наружу — без by; trigger и bot:action — только для ботов демо.
const outward = (event: RealtimeEvent): null | RealtimeEvent => {
  if (event.type === "trigger" || event.type === "bot:action") return null;
  if ("by" in event) {
    const { by: _by, ...rest } = event as RealtimeEvent & { by?: string };
    return rest as RealtimeEvent;
  }
  return event;
};

const HelloSchema = z.object({
  type: z.literal("hello"),
  token: z.string().min(1).max(200),
});

export const WS_UNAUTHORIZED = 4401;
const HELLO_TIMEOUT_MS = 5_000;
const HEARTBEAT_MS = 20_000;

export type SocketHub = EventHub & {
  close: () => Promise<void>;
  // Открытые сокеты и разные люди (R02, отчёт владельцу).
  stats: () => { people: number; sockets: number };
  // Upgrade-запрос на /v1/ws с http-сервера Fastify.
  handleUpgrade: (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ) => void;
};

// Рабочий хаб. resolve — токен → userId (сессия) или null.
export const createSocketHub = ({
  resolve,
  now,
  helloTimeoutMs = HELLO_TIMEOUT_MS,
  heartbeatMs = HEARTBEAT_MS,
}: {
  heartbeatMs?: number;
  helloTimeoutMs?: number;
  now: () => number;
  resolve: (token: string) => Promise<null | string>;
}): SocketHub => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 4 * 1024 });
  const byUser = new Map<string, Set<WebSocket>>();
  const alive = new WeakMap<WebSocket, boolean>();

  const register = (userId: string, socket: WebSocket) => {
    const sockets = byUser.get(userId) ?? new Set<WebSocket>();
    sockets.add(socket);
    byUser.set(userId, sockets);
    socket.on("close", () => {
      sockets.delete(socket);
      if (sockets.size === 0) byUser.delete(userId);
    });
  };

  wss.on("connection", (socket) => {
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));
    let authed = false;
    // Нет hello за 5 секунд — закрыть (§5).
    const timer = setTimeout(() => {
      if (!authed) socket.close(WS_UNAUTHORIZED, "hello required");
    }, helloTimeoutMs);
    socket.on("close", () => clearTimeout(timer));
    socket.once("message", (data, isBinary) => {
      let parsed: unknown = null;
      try {
        parsed = isBinary ? null : JSON.parse(String(data));
      } catch {
        parsed = null;
      }
      const hello = HelloSchema.safeParse(parsed);
      if (!hello.success) {
        socket.close(WS_UNAUTHORIZED, "hello required");
        return;
      }
      void resolve(hello.data.token).then(
        (userId) => {
          if (!userId) {
            socket.close(WS_UNAUTHORIZED, "unauthorized");
            return;
          }
          authed = true;
          clearTimeout(timer);
          register(userId, socket);
          socket.send(JSON.stringify({ type: "ready", userId, now: now() }));
        },
        () => socket.close(WS_UNAUTHORIZED, "unauthorized"),
      );
    });
  });

  // Сердцебиение: нет ответа на прошлый ping — закрыть (как в LAN).
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!alive.get(socket)) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, heartbeatMs);
  heartbeat.unref();

  return {
    deliver: (events) => {
      for (const { event, to } of events) {
        const shown = outward(event);
        if (!shown) continue;
        const text = JSON.stringify(shown);
        for (const userId of new Set(to)) {
          for (const socket of byUser.get(userId) ?? []) {
            if (socket.readyState === socket.OPEN) socket.send(text);
          }
        }
      }
    },
    stats: () => ({
      people: byUser.size,
      sockets: [...byUser.values()].reduce((sum, set) => sum + set.size, 0),
    }),
    handleUpgrade: (request, socket, head) => {
      wss.handleUpgrade(request, socket, head, (ws) =>
        wss.emit("connection", ws, request),
      );
    },
    close: async () => {
      clearInterval(heartbeat);
      for (const socket of wss.clients) socket.terminate();
      await new Promise<void>((done) => wss.close(() => done()));
    },
  };
};

// Хаб без сокетов (тесты без сети, сервер без базы): ничего не хранит.
export const createEventHub = (): EventHub => ({
  deliver: () => undefined,
});

// Хаб для тестов: всё доставленное — в delivered (как ушло бы наружу) и в
// addressed (с адресатами).
export const createRecordingHub = (): EventHub & {
  addressed: AddressedEvent[];
  delivered: RealtimeEvent[];
} => {
  const delivered: RealtimeEvent[] = [];
  const addressed: AddressedEvent[] = [];
  return {
    delivered,
    addressed,
    deliver: (events) => {
      for (const entry of events) {
        const shown = outward(entry.event);
        if (!shown) continue;
        delivered.push(shown);
        addressed.push({ event: shown, to: entry.to });
      }
    },
  };
};
