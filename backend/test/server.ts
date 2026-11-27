// Сервер для тестов одного сервера (не контрактных): приложение на тестовой
// базе, вызовы через app.inject с токеном.
import type { MeResponse } from "@swipeit/core/api/users/types";
import { createSeededRandom } from "@swipeit/core/logic/random";

import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import type { Db } from "../src/db/client";
import { NOW, testCatalog } from "./contract/client";

export type TestUser = { id: string; token: string };

export const createTestServer = async (database: Db) => {
  const app = buildApp({
    config: loadConfig({ LOG_LEVEL: "silent" }),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => NOW },
    random: createSeededRandom("server-test"),
  });

  const request = (
    user: null | TestUser,
    method: "DELETE" | "GET" | "PATCH" | "POST",
    url: string,
    body?: object,
  ) =>
    app.inject({
      method,
      url: `/v1${url}`,
      ...(body ? { payload: body } : {}),
      headers: user ? { authorization: `Bearer ${user.token}` } : {},
    });

  const newUser = async (patch?: object): Promise<TestUser> => {
    const response = await request(null, "POST", "/users");
    const { me, token } = response.json() as { me: MeResponse; token: string };
    const user = { id: me.id, token };
    if (patch) await request(user, "PATCH", "/me", patch);
    return user;
  };

  return { app, request, newUser, close: () => app.close() };
};
