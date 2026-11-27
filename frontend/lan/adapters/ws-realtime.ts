import type { IncomingMessage } from "node:http";
import type { Duplex } from "node:stream";
import { type WebSocket, WebSocketServer } from "ws";
import { z } from "zod";

import type { Realtime, RealtimeEvent } from "@/shared/lib/realtime/types";

// Клиент сообщает, кто сидит во вкладке: при подключении и при смене
// пользователя («Смотреть как», онбординг).
const HelloSchema = z.object({
  type: z.literal("hello"),
  userId: z.string().min(1).max(200).nullable(),
});

const HEARTBEAT_MS = 20_000;

export type WsRealtime = Realtime & {
  close(): Promise<void>;
  // Upgrade-запрос на /ws с общего http-сервера.
  handleUpgrade(request: IncomingMessage, socket: Duplex, head: Buffer): void;
  // Люди, у которых сейчас открыта вкладка (для GET /presence).
  online(): string[];
};

// Шина режима lan (TECH_SPEC §7): событие уходит всем телефонам по WebSocket
// и подписчикам внутри процесса — на них живут боты сервера. Заодно ведём
// онлайн: кто прислал hello и чей сокет ещё жив.
export const createWsRealtime = (): WsRealtime => {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const handlers = new Set<(event: RealtimeEvent) => void>();
  const users = new Map<WebSocket, null | string>();
  const alive = new WeakMap<WebSocket, boolean>();
  let lastOnline = "";

  const online = () =>
    [...new Set([...users.values()].filter((id): id is string => !!id))].sort();

  const publish = (event: RealtimeEvent) => {
    const text = JSON.stringify(event);
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.send(text);
    }
    for (const handler of handlers) {
      try {
        handler(event);
      } catch (error) {
        console.error("Ошибка подписчика шины:", error);
      }
    }
  };

  // Онлайн поменялся — пусть телефоны перечитают друзей («В этой сети»).
  const presenceChanged = () => {
    const key = online().join(",");
    if (key === lastOnline) return;
    lastOnline = key;
    publish({ type: "db:changed", scope: ["users"], by: "system" });
  };

  wss.on("connection", (socket) => {
    users.set(socket, null);
    alive.set(socket, true);
    socket.on("pong", () => alive.set(socket, true));
    socket.on("message", (data, isBinary) => {
      if (isBinary) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(String(data));
      } catch {
        return;
      }
      const hello = HelloSchema.safeParse(parsed);
      if (!hello.success) return;
      users.set(socket, hello.data.userId);
      presenceChanged();
    });
    socket.on("close", () => {
      users.delete(socket);
      presenceChanged();
    });
    socket.on("error", () => socket.terminate());
  });

  // Телефон ушёл в сон или потерял Wi-Fi без «до свидания» — сокет висит.
  // Пинг раз в 20 с: не ответил на прошлый — закрываем, онлайн обновится.
  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (alive.get(socket) === false) {
        socket.terminate();
        continue;
      }
      alive.set(socket, false);
      socket.ping();
    }
  }, HEARTBEAT_MS);
  heartbeat.unref();

  return {
    publish,
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
    online,
    handleUpgrade(request, socket, head) {
      wss.handleUpgrade(request, socket, head, (client) =>
        wss.emit("connection", client, request),
      );
    },
    close: () =>
      new Promise<void>((resolve) => {
        clearInterval(heartbeat);
        for (const client of wss.clients) client.terminate();
        wss.close(() => resolve());
      }),
  };
};
