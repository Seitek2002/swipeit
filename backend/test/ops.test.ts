import { createSeededRandom } from "@swipeit/core/logic/random";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { testConfig } from "./config";
import { makeFriends } from "../src/domains/friends/handlers";
import { formatFunnel, readFunnel } from "../src/domains/funnel/report";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";

// Отчёт владельцу GET /v1/ops/report (auto-tasks-pm-3 R02).
const database = createTestDb();
afterAll(() => database.close());

const TOKEN = "ops-token-for-tests-0123456789";
let app: ReturnType<typeof buildApp>;
beforeEach(async () => {
  await resetDb(database);
  app = buildApp({
    config: testConfig({ OPS_TOKEN: TOKEN }),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => NOW },
    random: createSeededRandom("ops"),
  });
});
afterEach(() => app.close());

type Person = { id: string; token: string };

const call = async (
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

const person = async (name: string): Promise<Person> => {
  const response = await app.inject({ method: "POST", url: "/v1/users" });
  const { me, token } = response.json() as {
    me: { id: string };
    token: string;
  };
  const created = { id: me.id, token };
  await call(created, "PATCH", "/me", { name });
  return created;
};

const report = (token?: string) =>
  app.inject({
    method: "GET",
    url: "/v1/ops/report?days=7",
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });

describe("отчёт владельцу (R02)", () => {
  it("без токена и с неверным — 404; без OPS_TOKEN в окружении — 404", async () => {
    expect((await report()).statusCode).toBe(404);
    expect((await report("wrong-token-wrong-token-xx")).statusCode).toBe(404);
    const bare = buildApp({
      config: testConfig(),
      db: database,
      catalog: await testCatalog(),
      clock: { now: () => NOW },
    });
    expect(
      (
        await bare.inject({
          method: "GET",
          url: "/v1/ops/report",
          headers: { authorization: `Bearer ${TOKEN}` },
        })
      ).statusCode,
    ).toBe(404);
    await bare.close();
  });

  it("«Сейчас»: игра на 5 с двумя вишлистами, после жеребьёвки — открыли 2 из 5; ни id, ни имён, ни названий", async () => {
    const { products } = await testCatalog();
    const owner = await person("Айгерим");
    const others: Person[] = [];
    for (const name of ["Азамат", "Нурай", "Бакыт", "Данияр"]) {
      const other = await person(name);
      await database.db.transaction((tx) =>
        makeFriends(tx, owner.id, other.id, "santa", { now: () => NOW }),
      );
      others.push(other);
    }
    const created = (
      await call(owner, "POST", "/santa", {
        title: "Секретный офис",
        budget: 2000,
        exchangeDate: "2026-12-25",
        participantIds: [],
      })
    ).json() as { game: { id: string } };
    const id = created.game.id;
    for (const other of others) await call(other, "POST", `/santa/${id}/join`);
    for (const who of [owner, others[0] as Person]) {
      await call(who, "POST", "/swipes", {
        productId: products[0]?.id,
        decision: "like",
        context: { kind: "self" },
      });
    }
    const before = (await report(TOKEN)).body;
    expect(before).toContain("5 участников");
    expect(before).toContain("с вишлистом 2");

    await call(owner, "POST", `/santa/${id}/draw`);
    await call(owner, "POST", `/santa/${id}/open`);
    await call(others[0] as Person, "POST", `/santa/${id}/open`);
    const response = await report(TOKEN);
    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/plain");
    const text = response.body;
    expect(text).toContain("открыли письмо 2 из 5");
    for (const secret of [
      id,
      owner.id,
      "Айгерим",
      "Азамат",
      "Секретный офис",
      ...others.map((o) => o.id),
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("три CONFLICT → «CONFLICT» в разделе ошибок вырос на 3", async () => {
    const conflicts = (text: string) =>
      Number(/CONFLICT: (\d+)/.exec(text)?.[1] ?? -1);
    const start = conflicts((await report(TOKEN)).body);
    const owner = await person("Айгерим");
    const created = (
      await call(owner, "POST", "/santa", {
        title: "Офис",
        budget: 2000,
        exchangeDate: "2026-12-25",
        participantIds: [],
      })
    ).json() as { game: { id: string } };
    // Жеребьёвка на одного — CONFLICT «нужно хотя бы 3».
    for (let index = 0; index < 3; index += 1) {
      expect(
        (await call(owner, "POST", `/santa/${created.game.id}/draw`))
          .statusCode,
      ).toBe(409);
    }
    expect(conflicts((await report(TOKEN)).body)).toBe(start + 3);
  });

  it("--since завтрашним днём — все нули", async () => {
    const owner = await person("Айгерим");
    expect(owner.id).toBeTruthy();
    const tomorrow = new Date(NOW + 24 * 3600_000).toISOString().slice(0, 10);
    const text = formatFunnel(
      await readFunnel(database.db, 7, NOW, tomorrow),
      7,
    );
    expect(text).toMatch(/profile_created\s+0/);
  });
});

describe("последние сбои в отчёте (S08)", () => {
  it("маршрут бросил исключение → строка с шаблоном маршрута и кодом; без id из пути и текста ошибки", async () => {
    const SECRET_ID = "u_SecretPathId42";
    const SECRET_TEXT = "Айгерим потеряла ключ 0555123456";
    app.get("/v1/test-boom/:id", async () => {
      throw new TypeError(SECRET_TEXT);
    });
    // Ошибка базы: код Postgres — в строке, текст с значениями — нет.
    app.post("/v1/test-db/:id", async () => {
      throw Object.assign(new Error(`duplicate key (name)=(${SECRET_TEXT})`), {
        name: "DrizzleQueryError",
        cause: Object.assign(new Error(SECRET_TEXT), { code: "23505" }),
      });
    });

    const boom = await app.inject({
      method: "GET",
      url: `/v1/test-boom/${SECRET_ID}`,
    });
    expect(boom.statusCode).toBe(500);
    const body = boom.json() as { code: string; requestId: string };
    expect(body.code).toBe("INTERNAL");
    expect(boom.body).not.toContain(SECRET_TEXT);
    const code = body.requestId.slice(0, 8);

    const db = await app.inject({
      method: "POST",
      url: `/v1/test-db/${SECRET_ID}`,
    });
    expect(db.statusCode).toBe(500);
    const dbCode = (db.json() as { requestId: string }).requestId.slice(0, 8);

    const text = (await report(TOKEN)).body;
    const section = text.slice(text.indexOf("Последние сбои"));
    expect(section).toContain("Последние сбои");
    const lines = section.split("\n");
    const boomLine = lines.find((line) => line.includes(`код ${code}`));
    expect(boomLine).toContain("GET /v1/test-boom/:id");
    expect(boomLine).toContain("TypeError");
    const dbLine = lines.find((line) => line.includes(`код ${dbCode}`));
    expect(dbLine).toContain("POST /v1/test-db/:id");
    expect(dbLine).toContain("DrizzleQueryError pg 23505");
    // Свежие сверху: сбой базы был позже.
    expect(lines.indexOf(dbLine ?? "")).toBeLessThan(
      lines.indexOf(boomLine ?? ""),
    );
    expect(text).not.toContain(SECRET_ID);
    expect(text).not.toContain(SECRET_TEXT);
    expect(text).not.toContain(body.requestId);
  });

  it("/v1/health — время запуска процесса", async () => {
    const health = await app.inject({ method: "GET", url: "/v1/health" });
    const { startedAt } = health.json() as { startedAt: string };
    expect(Number.isNaN(Date.parse(startedAt))).toBe(false);
  });
});
