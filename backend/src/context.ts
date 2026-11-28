import type { Random } from "@swipeit/core/logic/random";
import type { RealtimeEvent } from "@swipeit/core/realtime/types";
import type { FastifyBaseLogger } from "fastify";

import type { ServerCatalog } from "./catalog/load";
import type { Database } from "./db/client";

// Транзакция Drizzle — ctx.tx у обработчика (BACKEND.md §2.5).
export type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export type Clock = { now: () => number };

// События копятся в транзакции и уходят после commit, только адресатам (§5,
// B12): to — userId, кому событие. Транзакция откатилась — ничего не ушло.
export type EventSink = {
  publish: (event: RealtimeEvent, to: readonly string[]) => void;
};

// ctx обработчика сервера — та же форма (ctx, input), что у мока, но вместо
// базы целиком — транзакция PostgreSQL, а пользователь — из сессии по токену.
export type ServerContext = {
  catalog: ServerCatalog;
  clock: Clock;
  events: EventSink;
  // Фоновое перечитывание экрана (заголовок x-swipeit-refetch: 1, B15):
  // такой запрос ничего не делает «от имени человека» — например, не ставит
  // дружбу по ссылке (Q07).
  isRefetch: boolean;
  log: FastifyBaseLogger;
  // Начало коротких ссылок: url = publicShareUrl/s/<код> (§6.2).
  publicShareUrl: string;
  random: Random;
  // Сессия запроса: выход закрывает только её (§3.4).
  sessionId: null | string;
  tx: Tx;
  userAgent: null | string;
  userId: null | string;
};

export type HandlerInput = {
  body: unknown;
  params: Record<string, string>;
  query: Record<string, unknown>;
};

export type ServerHandler = (
  ctx: ServerContext,
  input: HandlerInput,
) => Promise<unknown>;

export const nowIso = (clock: Clock) => new Date(clock.now()).toISOString();
