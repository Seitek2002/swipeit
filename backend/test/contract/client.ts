// Тонкий клиент контрактных тестов (BACKEND.md §12, B04): один набор
// сценариев call(user, method, path, body) запускается дважды — на моке в
// памяти и на сервере (app.inject + PostgreSQL).
import type { MeResponse } from "@swipeit/core/api/users/types";
import type { RealtimeEvent } from "@swipeit/core/realtime/types";
import {
  ApiError,
  type ApiErrorCode,
  type ApiErrorReason,
} from "@swipeit/core/errors";
import type { HttpMethod } from "@swipeit/core/contract";
import { createSeededRandom } from "@swipeit/core/logic/random";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
  createRecordingRealtime,
} from "@/shared/api/mock-server/adapters/memory";
import { createSeedDb } from "@/shared/api/mock-server/seed";
import { createMockServer } from "@/shared/api/mock-server/server";

import { buildApp } from "../../src/app";
import { createSession } from "../../src/auth/sessions";
import { loadCatalog, type ServerCatalog } from "../../src/catalog/load";
import { testConfig } from "../config";
import { users, wishlistMeta } from "../../src/db/schema";
import { makeFriends } from "../../src/domains/friends/handlers";
import { createRecordingHub } from "../../src/realtime/hub";
import { runSchedulerOnce } from "../../src/scheduler";
import { createTestDb, resetDb } from "../db";

// 28 ноября 2026, полдень по Бишкеку.
export const NOW = Date.UTC(2026, 10, 28, 6);

export type Caller = { id: string; token?: string };

export type ApiClient = {
  // Перемотать часы (дедлайны планов).
  advance: (ms: number) => void;
  // Подружить двоих (на сервере дружба появляется сама — §4.3; в тестах
  // ставим её напрямую).
  befriend: (a: Caller, b: Caller) => Promise<void>;
  call: <T>(
    caller: Caller | null,
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ) => Promise<T>;
  close: () => Promise<void>;
  // События, опубликованные с начала теста (на сервере — после commit).
  events: () => readonly RealtimeEvent[];
  // Проход по дедлайнам «До даты»: у мока — POST /plans/expire (его зовёт
  // планировщик вкладки), у сервера — проход планировщика (B13). Ответ —
  // id закрытых планов.
  expire: () => Promise<string[]>;
  kind: "mock" | "server";
  newUser: () => Promise<{ caller: Caller; me: MeResponse }>;
  // Профиль с заданным id: у мока и сервера тогда один сид ленты (разброс
  // считается от userId и даты), и первые порции можно сравнить.
  userWithId: (id: string) => Promise<Caller>;
};

const here = path.dirname(fileURLToPath(import.meta.url));
export const CATALOG_DIR = path.resolve(here, "../../../catalog");

let catalogPromise: null | Promise<ServerCatalog> = null;
export const testCatalog = () =>
  (catalogPromise ??= loadCatalog(CATALOG_DIR, { warn: () => undefined }));

// Флаги функций клиента (config/features): по умолчанию — как в тестах и
// демо, всё включено. multiWishlists: false — сервер с
// FEATURE_MULTI_WISHLISTS=0 и мок с выключенным флагом.
export type ClientOptions = { multiWishlists?: boolean };

export const createMockClient = async (
  now = NOW,
  options: ClientOptions = {},
): Promise<ApiClient> => {
  const { products, activities, meta } = await testCatalog();
  const clock = createFixedClock(now);
  const db = createMemoryDb(async () =>
    createSeedDb({ products: [...products], now: clock.now() }),
  );
  const realtime = createRecordingRealtime();
  const server = createMockServer({
    catalog: createMemoryCatalog(
      [...products],
      [...activities],
      meta ?? undefined,
    ),
    clock,
    db,
    multiWishlists: options.multiWishlists ?? true,
    realtime,
    random: createSeededRandom("contract"),
    settings: createMemorySettings(),
  });
  const call: ApiClient["call"] = (caller, method, url, body, query) =>
    server.handle({
      method,
      path: url,
      userId: caller?.id ?? null,
      body,
      query,
    }) as never;
  return {
    kind: "mock",
    advance: (ms) => clock.advance(ms),
    events: () => realtime.events,
    call,
    expire: async () =>
      (await call<{ expired: string[] }>(null, "POST", "/plans/expire"))
        .expired,
    newUser: async () => {
      const me = await call<MeResponse>(null, "POST", "/users", {});
      return { me, caller: { id: me.id } };
    },
    befriend: async (a, b) => {
      await db.write((data) => {
        data.friends[a.id] = [
          ...new Set([...(data.friends[a.id] ?? []), b.id]),
        ];
        data.friends[b.id] = [
          ...new Set([...(data.friends[b.id] ?? []), a.id]),
        ];
      });
    },
    userWithId: async (id) => {
      await db.write((data) => {
        data.users[id] = {
          id,
          avatarColor: "mint",
          interests: [],
          audience: "all",
          isBot: false,
          createdAt: new Date(NOW).toISOString(),
        };
        data.wishlistItems[id] = [];
        data.wishlistMeta[id] = { ownerId: id, hideReservationCount: false };
      });
      return { id };
    },
    close: async () => undefined,
  };
};

export const createServerClient = async (
  now = NOW,
  options: ClientOptions = {},
): Promise<ApiClient> => {
  const database = createTestDb();
  await resetDb(database);
  let current = now;
  const hub = createRecordingHub();
  const app = buildApp({
    config: testConfig(
      options.multiWishlists === false
        ? { FEATURE_MULTI_WISHLISTS: "0" }
        : { FEATURE_MULTI_WISHLISTS: "1" },
    ),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => current },
    random: createSeededRandom("contract"),
    hub,
  });
  const call: ApiClient["call"] = async (caller, method, url, body, query) => {
    const response = await app.inject({
      method,
      url: `/v1${url}`,
      query: Object.fromEntries(
        Object.entries(query ?? {}).map(([key, value]) => [key, String(value)]),
      ),
      ...(body === undefined ? {} : { payload: body as object }),
      headers: caller?.token ? { authorization: `Bearer ${caller.token}` } : {},
    });
    const json = response.json() as {
      code?: ApiErrorCode;
      message?: string;
      reason?: ApiErrorReason;
    };
    if (response.statusCode >= 400) {
      throw new ApiError(
        response.statusCode,
        json.code ?? "INTERNAL",
        json.message ?? "",
        undefined,
        json.reason,
      );
    }
    return json as never;
  };
  return {
    kind: "server",
    advance: (ms) => {
      current += ms;
    },
    events: () => hub.delivered,
    call,
    expire: async () => {
      const result = await runSchedulerOnce({
        db: database,
        catalog: await testCatalog(),
        clock: { now: () => current },
        random: createSeededRandom("contract"),
        hub,
        log: app.log,
      });
      return result.expired;
    },
    newUser: async () => {
      const { me, token } = await call<{ me: MeResponse; token: string }>(
        null,
        "POST",
        "/users",
        {},
      );
      return { me, caller: { id: me.id, token } };
    },
    befriend: async (a, b) => {
      await database.db.transaction((tx) =>
        makeFriends(tx, a.id, b.id, "plan", { now: () => NOW }),
      );
    },
    userWithId: async (id) => {
      const { token } = await database.db.transaction(async (tx) => {
        await tx
          .insert(users)
          .values({ id, avatarColor: "mint", createdAt: new Date(NOW) });
        await tx.insert(wishlistMeta).values({ ownerId: id });
        return createSession(tx, id, { now: () => NOW }, null);
      });
      return { id, token };
    },
    close: async () => {
      await app.close();
      await database.close();
    },
  };
};

export const CLIENTS = [
  ["мок", createMockClient],
  ["сервер", createServerClient],
] as const;
