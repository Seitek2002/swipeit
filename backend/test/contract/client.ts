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
import { loadCatalog, type ServerCatalog } from "../../src/catalog/load";
import { loadConfig } from "../../src/config";
import { createTestDb, resetDb } from "../db";

// 28 ноября 2026, полдень по Бишкеку.
export const NOW = Date.UTC(2026, 10, 28, 6);

export type Caller = { id: string; token?: string };

export type ApiClient = {
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
};

const here = path.dirname(fileURLToPath(import.meta.url));
export const CATALOG_DIR = path.resolve(here, "../../../catalog");

let catalogPromise: null | Promise<ServerCatalog> = null;
export const testCatalog = () =>
  (catalogPromise ??= loadCatalog(CATALOG_DIR, { warn: () => undefined }));

export const createMockClient = async (): Promise<ApiClient> => {
  const { products } = await testCatalog();
  const clock = createFixedClock(NOW);
  const server = createMockServer({
    catalog: createMemoryCatalog([...products]),
    clock,
    db: createMemoryDb(async () =>
      createSeedDb({ products: [...products], now: clock.now() }),
    ),
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
    close: async () => undefined,
  };
};

export const createServerClient = async (): Promise<ApiClient> => {
  const database = createTestDb();
  await resetDb(database);
  const app = buildApp({
    config: loadConfig({ LOG_LEVEL: "silent" }),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => NOW },
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
