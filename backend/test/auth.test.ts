import type { MeResponse } from "@swipeit/core/api/users/types";
import { toDateKey } from "@swipeit/core/format";
import { createSeededRandom } from "@swipeit/core/logic/random";
import { eq } from "drizzle-orm";
import { Writable } from "node:stream";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import {
  createSession,
  hashToken,
  SESSION_IDLE_MS,
} from "../src/auth/sessions";
import { loadConfig } from "../src/config";
import { sessions } from "../src/db/schema";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";

const database = createTestDb();
afterAll(() => database.close());
beforeEach(() => resetDb(database));

// Часы, которые тест двигает сам.
const makeClock = () => {
  let now = NOW;
  return { now: () => now, advance: (ms: number) => (now += ms) };
};

const makeApp = async (
  clock = makeClock(),
  extra: Partial<Parameters<typeof buildApp>[0]> = {},
) =>
  buildApp({
    config: loadConfig({ LOG_LEVEL: "silent" }),
    db: database,
    catalog: await testCatalog(),
    clock,
    random: createSeededRandom("auth"),
    ...extra,
  });

const signUp = async (app: Awaited<ReturnType<typeof makeApp>>) => {
  const response = await app.inject({ method: "POST", url: "/v1/users" });
  expect(response.statusCode).toBe(200);
  return response.json() as { me: MeResponse; token: string };
};

const me = (app: Awaited<ReturnType<typeof makeApp>>, token?: string) =>
  app.inject({
    method: "GET",
    url: "/v1/me",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("сессии (BACKEND.md §3.2)", () => {
  it("POST /users — профиль и токен; в базе только SHA-256 токена", async () => {
    const app = await makeApp();
    const { me: profile, token } = await signUp(app);
    expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await database.db.select().from(sessions);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.userId).toBe(profile.id);
    expect(rows[0]?.tokenHash.equals(hashToken(token))).toBe(true);
    expect(rows[0]?.tokenHash.toString()).not.toContain(token);
    const response = await me(app, token);
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ id: profile.id });
    await app.close();
  });

  it("без токена, с чужим и с закрытым токеном — 401 UNAUTHORIZED", async () => {
    const app = await makeApp();
    const { token } = await signUp(app);
    const none = await me(app);
    expect(none.statusCode).toBe(401);
    expect(none.json()).toMatchObject({ code: "UNAUTHORIZED" });
    expect(none.json().requestId).toEqual(expect.any(String));
    expect((await me(app, "чужой-токен")).statusCode).toBe(401);
    await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${token}` },
    });
    expect((await me(app, token)).statusCode).toBe(401);
    await app.close();
  });

  it("выход закрывает только эту сессию: второе устройство остаётся в профиле", async () => {
    const app = await makeApp();
    const { me: profile, token: phone } = await signUp(app);
    const { token: laptop } = await database.db.transaction((tx) =>
      createSession(tx, profile.id, { now: () => NOW }, "laptop"),
    );
    await app.inject({
      method: "POST",
      url: "/v1/auth/logout",
      headers: { authorization: `Bearer ${phone}` },
    });
    expect((await me(app, phone)).statusCode).toBe(401);
    const other = await me(app, laptop);
    expect(other.statusCode).toBe(200);
    expect(other.json()).toMatchObject({ id: profile.id });
    await app.close();
  });

  it("сессия, которой не пользовались 180 дней, закрыта", async () => {
    const clock = makeClock();
    const app = await makeApp(clock);
    const { token } = await signUp(app);
    clock.advance(SESSION_IDLE_MS - 60_000);
    expect((await me(app, token)).statusCode).toBe(200);
    // Пользовались — отсчёт пошёл заново.
    clock.advance(SESSION_IDLE_MS - 60_000);
    expect((await me(app, token)).statusCode).toBe(200);
    clock.advance(SESSION_IDLE_MS + 60_000);
    expect((await me(app, token)).statusCode).toBe(401);
    const [row] = await database.db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(token)));
    expect(row?.revokedAt).not.toBeNull();
    await app.close();
  });
});

describe("ошибки и логи (BACKEND.md §4.5, §12)", () => {
  it("в логах нет токена и заголовка Authorization", async () => {
    let logs = "";
    const sink = new Writable({
      write(chunk, _encoding, done) {
        logs += String(chunk);
        done();
      },
    });
    const app = buildApp({
      config: loadConfig({ LOG_LEVEL: "trace" }),
      db: database,
      catalog: await testCatalog(),
      clock: { now: () => NOW },
      logStream: sink,
    });
    const { token } = await signUp(app);
    await me(app, token);
    await me(app, "чужой-токен-для-лога");
    await app.close();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs).toContain("requestId");
    expect(logs).not.toContain(token);
    expect(logs).not.toContain("чужой-токен-для-лога");
    expect(logs.toLowerCase()).not.toContain("authorization");
    expect(logs).not.toContain("Bearer");
  });

  it("неизвестная ошибка — 500 INTERNAL без подробностей наружу", async () => {
    const app = await makeApp();
    app.get("/v1/boom", async () => {
      throw new Error("секрет базы: пароль 123");
    });
    const response = await app.inject({ method: "GET", url: "/v1/boom" });
    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body).toMatchObject({ code: "INTERNAL" });
    expect(body.requestId).toEqual(response.headers["x-request-id"]);
    expect(JSON.stringify(body)).not.toContain("секрет");
    await app.close();
  });

  it("неизвестный путь — 404 NOT_FOUND; битый JSON — 400 VALIDATION", async () => {
    const app = await makeApp();
    const missing = await app.inject({ method: "GET", url: "/v1/nope" });
    expect(missing.statusCode).toBe(404);
    expect(missing.json()).toMatchObject({ code: "NOT_FOUND" });
    const { token } = await signUp(app);
    const broken = await app.inject({
      method: "PATCH",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
      },
      payload: "{не json",
    });
    expect(broken.statusCode).toBe(400);
    expect(broken.json()).toMatchObject({ code: "VALIDATION" });
    await app.close();
  });

  it("/v1/health — версия каталога", async () => {
    const app = await makeApp();
    const health = await app.inject({ method: "GET", url: "/v1/health" });
    expect(health.json()).toMatchObject({
      mode: "remote",
      catalogVersion: (await testCatalog()).version,
    });
    await app.close();
  });
});

describe("часовой пояс (BACKEND.md §2.5)", () => {
  it("в 01:00 по Бишкеку toDateKey даёт сегодняшний день Бишкека", () => {
    // 27 ноября 19:00 UTC = 28 ноября 01:00 в Бишкеке (UTC+6).
    expect(toDateKey(Date.UTC(2026, 10, 27, 19, 0))).toBe("2026-11-28");
    expect(process.env.TZ).toBe("Asia/Bishkek");
  });
});
