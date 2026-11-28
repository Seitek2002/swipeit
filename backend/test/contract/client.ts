// Тонкий клиент контрактных тестов (BACKEND.md §12, B04): один набор
// сценариев call(user, method, path, body) запускается дважды — на моке в
// памяти и на сервере (app.inject + PostgreSQL).
import type { MeResponse } from "@swipeit/core/api/users/types";
import { ApiError, type ApiErrorCode } from "@swipeit/core/errors";
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
import { loadConfig } from "../../src/config";
import { users, wishlistMeta } from "../../src/db/schema";
import { makeFriends } from "../../src/domains/friends/handlers";
import { createTestDb, resetDb } from "../db";

// 28 ноября 2026, полдень по Бишкеку.
export const NOW = Date.UTC(2026, 10, 28, 6);

export type Caller = { id: string; token?: string };

export type ApiClient = {
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

export const createMockClient = async (now = NOW): Promise<ApiClient> => {
  const { products, activities, meta } = await testCatalog();
  const clock = createFixedClock(now);
  const db = createMemoryDb(async () =>
    createSeedDb({ products: [...products], now: clock.now() }),
  );
  const server = createMockServer({
    catalog: createMemoryCatalog(
      [...products],
      [...activities],
      meta ?? undefined,
    ),
    clock,
    db,
    realtime: createRecordingRealtime(),
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
    call,
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

export const createServerClient = async (now = NOW): Promise<ApiClient> => {
  const database = createTestDb();
  await resetDb(database);
  const app = buildApp({
    config: loadConfig({ LOG_LEVEL: "silent" }),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => now },
    random: createSeededRandom("contract"),
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
    };
    if (response.statusCode >= 400) {
      throw new ApiError(
        response.statusCode,
        json.code ?? "INTERNAL",
        json.message ?? "",
      );
    }
    return json as never;
  };
  return {
    kind: "server",
    call,
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
