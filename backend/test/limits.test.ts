import { Writable } from "node:stream";

import { createSeededRandom } from "@swipeit/core/logic/random";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { makeClock } from "./server";

// Защита (BACKEND.md B17) и лимиты по сессии, а не по IP (auto-tasks-pm-3
// R01). Здесь — значения лимитов по умолчанию; все запросы app.inject идут с
// одного адреса, как офис за одним Wi-Fi.
const database = createTestDb();
afterAll(() => database.close());

let clock: ReturnType<typeof makeClock>;
let app: ReturnType<typeof buildApp>;
beforeEach(async () => {
  await resetDb(database);
  clock = makeClock();
  app = buildApp({
    config: loadConfig({
      LOG_LEVEL: "silent",
      CORS_ORIGINS: "https://swipeit.example, https://staging.swipeit.example",
    }),
    db: database,
    catalog: await testCatalog(),
    clock,
    random: createSeededRandom("limits"),
  });
});
afterEach(() => app.close());

type Person = { id: string; token: string };

const signUp = async () => {
  const response = await app.inject({ method: "POST", url: "/v1/users" });
  return response;
};

const call = (
  who: Person,
  method: "GET" | "PATCH" | "POST",
  url: string,
  body?: object,
) =>
  app.inject({
    method,
    url: `/v1${url}`,
    headers: { authorization: `Bearer ${who.token}` },
    ...(body ? { payload: body } : {}),
  });

const asPerson = (response: Awaited<ReturnType<typeof signUp>>): Person => {
  const { me, token } = response.json() as {
    me: { id: string };
    token: string;
  };
  return { id: me.id, token };
};

describe("лимиты по сессии (R01)", () => {
  it("офис: 30 профилей с одного IP за 10 минут — свайпы, Санта, ссылка с перечитыванием — ни одного 429", async () => {
    const { products } = await testCatalog();
    const statuses: number[] = [];
    const owner = asPerson(await signUp());
    await call(owner, "PATCH", "/me", { name: "Айгерим" });
    for (const product of products.slice(0, 5)) {
      await call(owner, "POST", "/swipes", {
        productId: product.id,
        decision: "like",
        context: { kind: "self" },
      });
    }
    const { code } = (await call(owner, "POST", "/wishlist/share")).json() as {
      code: string;
    };
    const game = (
      await call(owner, "POST", "/santa", {
        title: "Офис",
        budget: 2000,
        exchangeDate: "2026-12-25",
        participantIds: [],
      })
    ).json() as { game: { id: string } };
    for (let index = 0; index < 30; index += 1) {
      clock.advance(20_000);
      const created = await signUp();
      statuses.push(created.statusCode);
      const colleague = asPerson(created);
      statuses.push(
        (await call(colleague, "PATCH", "/me", { name: `Коллега ${index}` }))
          .statusCode,
      );
      for (const product of products.slice(0, 40)) {
        statuses.push(
          (
            await call(colleague, "POST", "/swipes", {
              productId: product.id,
              decision: "pass",
              context: { kind: "self" },
            })
          ).statusCode,
        );
      }
      statuses.push(
        (await call(colleague, "POST", `/santa/${game.game.id}/join`))
          .statusCode,
      );
      // Гостевой экран перечитывает ссылку раз в 30 с.
      statuses.push(
        (await call(colleague, "GET", `/share/${code}`)).statusCode,
      );
      statuses.push(
        (await call(colleague, "GET", `/share/${code}`)).statusCode,
      );
    }
    expect(statuses.filter((status) => status === 429)).toEqual([]);
  }, 180_000);

  it("POST /users: 21-й за минуту — 429 с Retry-After; 201-й за час — 429", async () => {
    for (let index = 0; index < 20; index += 1) {
      expect((await signUp()).statusCode).toBe(200);
    }
    const blocked = await signUp();
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json()).toMatchObject({ code: "RATE_LIMITED" });
    expect(Number(blocked.headers["retry-after"])).toBeGreaterThan(0);

    // Дальше — по одному в 3,5 с: минутный лимит не мешает, часовой — 200.
    clock.advance(60_000);
    let created = 20;
    while (created < 200) {
      clock.advance(3_500);
      expect((await signUp()).statusCode).toBe(200);
      created += 1;
    }
    clock.advance(3_500);
    expect((await signUp()).statusCode).toBe(429);
  }, 180_000);

  it("один токен: 301-й запрос за минуту — 429; другой токен с того же IP — 200", async () => {
    const first = asPerson(await signUp());
    const second = asPerson(await signUp());
    for (let index = 0; index < 299; index += 1) {
      expect((await call(first, "GET", "/me")).statusCode).toBe(200);
    }
    // 300-й — ещё можно (один ушёл на POST /users без токена — он по IP).
    expect((await call(first, "GET", "/me")).statusCode).toBe(200);
    expect((await call(first, "GET", "/me")).statusCode).toBe(429);
    expect((await call(second, "GET", "/me")).statusCode).toBe(200);
  }, 120_000);
});

describe("защита (B17)", () => {
  it("CORS — только своим адресам; тело 200 КБ — 413; заголовки helmet", async () => {
    const own = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: { origin: "https://swipeit.example" },
    });
    expect(own.headers["access-control-allow-origin"]).toBe(
      "https://swipeit.example",
    );
    expect(own.headers["x-content-type-options"]).toBe("nosniff");
    const foreign = await app.inject({
      method: "GET",
      url: "/v1/health",
      headers: { origin: "https://evil.example" },
    });
    expect(foreign.headers["access-control-allow-origin"]).toBeUndefined();
    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/v1/me",
      headers: {
        origin: "https://staging.swipeit.example",
        "access-control-request-method": "PATCH",
      },
    });
    expect(preflight.statusCode).toBe(204);
    expect(preflight.headers["access-control-allow-methods"]).toContain(
      "PATCH",
    );

    const me = asPerson(await signUp());
    const big = await app.inject({
      method: "PATCH",
      url: "/v1/me",
      headers: {
        authorization: `Bearer ${me.token}`,
        "content-type": "application/json",
      },
      payload: JSON.stringify({ name: "x".repeat(200 * 1024) }),
    });
    expect(big.statusCode).toBe(413);
  });

  it("production без TRUST_PROXY — предупреждение в логе; с ним — нет", async () => {
    const logsOf = async (env: Record<string, string>) => {
      let logs = "";
      const sink = new Writable({
        write(chunk, _encoding, done) {
          logs += String(chunk);
          done();
        },
      });
      const prod = buildApp({
        config: loadConfig({
          NODE_ENV: "production",
          DATABASE_URL: "postgres://db/x",
          PUBLIC_SHARE_URL: "https://swipeit.example",
          ...env,
        }),
        logStream: sink,
      });
      await prod.close();
      return logs;
    };
    expect(await logsOf({})).toContain("TRUST_PROXY");
    expect(await logsOf({ TRUST_PROXY: "true" })).not.toContain(
      "TRUST_PROXY не задан",
    );
  });
});
