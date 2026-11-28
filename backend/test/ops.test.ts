import { createSeededRandom } from "@swipeit/core/logic/random";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { testConfig } from "./config";
import {
  funnelDaily,
  identities,
  notifications,
  users,
} from "../src/db/schema";
import { makeFriends } from "../src/domains/friends/handlers";
import { formatBot } from "../src/domains/funnel/live";
import { formatFunnel, readFunnel } from "../src/domains/funnel/report";
import {
  createTelegramSender,
  sendDueNotifications,
} from "../src/domains/notifications/sender";
import { createErrorLog } from "../src/errors";
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
    expect(text).toMatch(/новые профили\s+0\s+\(profile_created\)/);
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

// ── auto-tasks-metrics-1 ──────────────────────────────────────────────

const REHEARSAL = { "x-swipeit-rehearsal": TOKEN };

// Профиль репетиции: POST /users с заголовком x-swipeit-rehearsal.
const rehearsalPerson = async (
  name: string,
  header: string = TOKEN,
): Promise<Person> => {
  const response = await app.inject({
    method: "POST",
    url: "/v1/users",
    headers: { "x-swipeit-rehearsal": header },
  });
  const { me, token } = response.json() as {
    me: { id: string };
    token: string;
  };
  const created = { id: me.id, token };
  await call(created, "PATCH", "/me", { name });
  return created;
};

const stepCount = async (step: string) =>
  (
    await database.db
      .select({ count: funnelDaily.count })
      .from(funnelDaily)
      .where(eq(funnelDaily.step, step))
  ).reduce((sum, row) => sum + row.count, 0);

const isInternal = async (id: string) =>
  (
    await database.db
      .select({ internal: users.funnelInternal })
      .from(users)
      .where(eq(users.id, id))
  )[0]?.internal;

// Игра: организатор и вступившие (через дружбу, как в тесте выше).
const santaWith = async (owner: Person, others: readonly Person[]) => {
  for (const other of others) {
    await database.db.transaction((tx) =>
      makeFriends(tx, owner.id, other.id, "santa", { now: () => NOW }),
    );
  }
  const created = (
    await call(owner, "POST", "/santa", {
      title: "Секретный офис",
      budget: 2000,
      exchangeDate: "2026-12-25",
      participantIds: [],
    })
  ).json() as { game: { id: string } };
  for (const other of others) {
    await call(other, "POST", `/santa/${created.game.id}/join`);
  }
  return created.game.id;
};

const reportWith = (query: string) =>
  app.inject({
    method: "GET",
    url: `/v1/ops/report?${query}`,
    headers: { authorization: `Bearer ${TOKEN}` },
  });

// Раздел «за период из базы» и раздел «с последнего запуска» (M05).
const sections = (text: string) => {
  const daily = text.indexOf("Ответы с ошибкой за период");
  const sinceStart = text.indexOf("Ответы с ошибкой с последнего запуска");
  const failures = text.indexOf("Последние сбои");
  return {
    daily: text.slice(daily, sinceStart),
    sinceStart: text.slice(sinceStart, failures),
  };
};

describe("репетиция не попадает в счётчики пилота (M01)", () => {
  it("POST /users с верным x-swipeit-rehearsal — профиль свой, profile_created не растёт", async () => {
    const before = await stepCount("profile_created");
    const rehearsal = await rehearsalPerson("Айгерим");
    expect(await isInternal(rehearsal.id)).toBe(true);
    expect(await stepCount("profile_created")).toBe(before);
    // Свой профиль — и дальше шаги не считаются.
    const { products } = await testCatalog();
    await call(rehearsal, "POST", "/swipes", {
      productId: products[0]?.id,
      decision: "like",
      context: { kind: "self" },
    });
    expect(await stepCount("first_swipe")).toBe(0);
  });

  it("неверный токен в заголовке — профиль обычный, profile_created +1", async () => {
    const before = await stepCount("profile_created");
    const wrong = await rehearsalPerson(
      "Азамат",
      "wrong-token-wrong-token-wrong",
    );
    expect(await isInternal(wrong.id)).toBe(false);
    expect(await stepCount("profile_created")).toBe(before + 1);
  });

  it("без OPS_TOKEN на сервере заголовок не действует", async () => {
    const bare = buildApp({
      config: testConfig(),
      db: database,
      catalog: await testCatalog(),
      clock: { now: () => NOW },
    });
    const response = await bare.inject({
      method: "POST",
      url: "/v1/users",
      headers: REHEARSAL,
    });
    const { me } = response.json() as { me: { id: string } };
    expect(await isInternal(me.id)).toBe(false);
    expect(await stepCount("profile_created")).toBe(1);
    await bare.close();
  });

  it("«Сейчас»: игра своих скрыта — «служебных игр скрыто: 1»; с internal=1 видна; смешанная — видна", async () => {
    const owner = await rehearsalPerson("Айгерим");
    const id = await santaWith(owner, [
      await rehearsalPerson("Азамат"),
      await rehearsalPerson("Нурай"),
    ]);
    // Организатор свой, но вступил обычный человек — игра настоящая.
    const mixedOwner = await rehearsalPerson("Бакыт");
    await santaWith(mixedOwner, [await person("Данияр")]);

    const plain = (await reportWith("days=1")).body;
    expect(plain).toContain("служебных игр скрыто: 1");
    expect(plain).not.toContain("3 участника");
    expect(plain).toContain("2 участника");
    const all = (await reportWith("days=1&internal=1")).body;
    expect(all).toContain("3 участника");
    expect(all).toContain("2 участника");
    expect(all).toContain("служебных игр скрыто: 0");
    for (const text of [plain, all]) {
      expect(text).not.toContain(id);
      expect(text).not.toContain("Секретный офис");
      expect(text).not.toContain(owner.id);
    }
    // internal=1 — только с тем же токеном: без него весь отчёт 404.
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/ops/report?internal=1",
        })
      ).statusCode,
    ).toBe(404);
  });

  it("CONFLICT своего профиля и репетиции — в «из них свои/репетиция»", async () => {
    const owner = await rehearsalPerson("Айгерим");
    const stranger = await person("Азамат");
    const games: string[] = [];
    for (const who of [owner, stranger]) {
      const created = (
        await call(who, "POST", "/santa", {
          title: "Офис",
          budget: 2000,
          exchangeDate: "2026-12-25",
          participantIds: [],
        })
      ).json() as { game: { id: string } };
      games.push(created.game.id);
    }
    // Жеребьёвка на одного — CONFLICT: 2 у своего, 1 у обычного.
    const draws: Array<[Person, string]> = [
      [owner, games[0] ?? ""],
      [owner, games[0] ?? ""],
      [stranger, games[1] ?? ""],
    ];
    for (const [who, game] of draws) {
      expect((await call(who, "POST", `/santa/${game}/draw`)).statusCode).toBe(
        409,
      );
    }
    // Без сессии, но с заголовком репетиции — тоже свой (401).
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/v1/me",
          headers: REHEARSAL,
        })
      ).statusCode,
    ).toBe(401);
    const { daily, sinceStart } = sections((await report(TOKEN)).body);
    for (const section of [daily, sinceStart]) {
      expect(section).toContain("CONFLICT: 3, из них свои/репетиция: 2");
      expect(section).toContain("UNAUTHORIZED: 1, из них свои/репетиция: 1");
    }
  });
});

describe("ошибки по дням в базе (M05)", () => {
  it("три CONFLICT, перезапуск процесса → за день по-прежнему 3, «с запуска» — 0", async () => {
    const owner = await person("Айгерим");
    const created = (
      await call(owner, "POST", "/santa", {
        title: "Офис",
        budget: 2000,
        exchangeDate: "2026-12-25",
        participantIds: [],
      })
    ).json() as { game: { id: string } };
    for (let index = 0; index < 3; index += 1) {
      await call(owner, "POST", `/santa/${created.game.id}/draw`);
    }
    // «Перезапуск»: новое приложение — новые счётчики в памяти.
    await app.close();
    app = buildApp({
      config: testConfig({ OPS_TOKEN: TOKEN }),
      db: database,
      catalog: await testCatalog(),
      clock: { now: () => NOW },
    });
    const text = (await report(TOKEN)).body;
    const { daily, sinceStart } = sections(text);
    expect(daily).toMatch(/\n {2}CONFLICT: 3\n/);
    expect(daily).toContain("CONFLICT 3");
    expect(sinceStart).toMatch(/\n {2}CONFLICT: 0\n/);
    // NOT_FOUND — в списке; строки OFFLINE нет.
    expect(daily).toContain("NOT_FOUND: 0");
    expect(sinceStart).toContain("NOT_FOUND: 0");
    expect(text).not.toContain("OFFLINE");
  });

  it("NOT_FOUND обработчика считается; неизвестный адрес — нет", async () => {
    const owner = await person("Айгерим");
    expect((await call(owner, "GET", "/santa/sg_nope_nope")).statusCode).toBe(
      404,
    );
    await app.inject({ method: "GET", url: "/v1/scanner/wp-login.php" });
    const { daily } = sections((await report(TOKEN)).body);
    expect(daily).toMatch(/\n {2}NOT_FOUND: 1\n/);
  });

  it("база недоступна → /health 503 как раньше, «/health отвечал 503: 1 раз»", async () => {
    const down = buildApp({
      config: testConfig({ OPS_TOKEN: TOKEN }),
      db: { ...database, ping: async () => false },
      catalog: await testCatalog(),
      clock: { now: () => NOW },
    });
    const health = await down.inject({ method: "GET", url: "/v1/health" });
    expect(health.statusCode).toBe(503);
    expect(health.json()).toEqual({
      code: "OFFLINE",
      message: "База данных недоступна",
      requestId: health.headers["x-request-id"],
    });
    const text = (
      await down.inject({
        method: "GET",
        url: "/v1/ops/report?days=1",
        headers: { authorization: `Bearer ${TOKEN}` },
      })
    ).body;
    await down.close();
    const { daily, sinceStart } = sections(text);
    expect(sinceStart).toContain("/health отвечал 503: 1 раз");
    // Счётчик дождался базы и записан за день.
    expect(daily).toContain("/health отвечал 503: 1 раз");
    expect(text).not.toContain("OFFLINE");
  });

  it("запись в базу упала — счётчик ждёт в памяти и уходит со следующей", async () => {
    const written: Array<{ code: string; count: number; internal: number }> =
      [];
    let failing = true;
    const log = createErrorLog({
      clock: { now: () => NOW },
      write: async (rows) => {
        if (failing) throw new Error("ECONNREFUSED");
        written.push(...rows);
      },
    });
    log.count("INTERNAL", false);
    log.count("CONFLICT", true);
    await log.flush();
    expect(written).toEqual([]);
    expect(log.hasPending()).toBe(true);
    failing = false;
    log.count("INTERNAL", false);
    await log.flush();
    expect(log.hasPending()).toBe(false);
    const total = (code: string) =>
      written
        .filter((row) => row.code === code)
        .reduce((sum, row) => sum + row.count, 0);
    expect(total("INTERNAL")).toBe(2);
    expect(total("CONFLICT")).toBe(1);
    expect(written.find((row) => row.code === "CONFLICT")?.internal).toBe(1);
    // В памяти — всё сразу.
    expect(log.counts().INTERNAL).toEqual({ count: 2, internal: 0 });
  });
});

describe("бот в отчёте (M09)", () => {
  const BOT_TOKEN = "123456:ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const SECRET_TEXT = "Тайный Санта «Секретный офис»: жеребьёвка прошла";
  const SECRET_REF = "sg_SecretRef42";

  const linkTelegram = (
    who: Person,
    chatId: string,
    extra: { botBlockedAt?: Date; botMessages?: boolean } = {},
  ) =>
    database.db.insert(identities).values({
      userId: who.id,
      provider: "telegram",
      subject: `sub-${chatId}`,
      chatId,
      ...extra,
    });

  it("подставной Bot API: 3 ушло, 1 blocked, 1 ждёт → строка с этими числами; ни текстов, ни id", async () => {
    const people: Person[] = [];
    const names = ["Айгерим", "Азамат", "Нурай", "Бакыт", "Данияр"];
    for (const [index, name] of names.entries()) {
      const who = await person(name);
      people.push(who);
      await linkTelegram(who, `chat-${index + 1}`);
      await database.db.insert(notifications).values({
        userId: who.id,
        kind: "santa_drawn",
        refId: SECRET_REF,
        dedupeKey: `test:${who.id}`,
        text: SECRET_TEXT,
        createdAt: new Date(NOW),
        nextAt: new Date(NOW),
      });
    }
    // chat-1…3 — ушло, chat-4 — заблокировал бота, chat-5 — 500 (повтор).
    const sender = createTelegramSender({
      apiUrl: "https://bot.test",
      token: BOT_TOKEN,
      fetchImpl: async (_url, init) => {
        const { chat_id: chat } = JSON.parse(String(init.body)) as {
          chat_id: string;
        };
        if (chat === "chat-4") {
          return new Response(
            JSON.stringify({ ok: false, description: "Forbidden" }),
            { status: 403 },
          );
        }
        if (chat === "chat-5") return new Response("{}", { status: 500 });
        return new Response(JSON.stringify({ ok: true }), { status: 200 });
      },
    });
    const sent = await sendDueNotifications({
      appUrl: "https://swipeit.example",
      clock: { now: () => NOW },
      db: database,
      log: app.log,
      sender,
    });
    expect(sent.sent).toBe(3);

    const text = (await report(TOKEN)).body;
    expect(text).toContain(
      "Санта: жеребьёвка прошла: ушло 3, ждёт 1, не дошло 1; причины: blocked 1, http_500 1",
    );
    // В тестовом окружении TELEGRAM_BOT_TOKEN не задан.
    expect(text).toContain("бот выключен: сообщения только в журнале");
    for (const secret of [
      SECRET_TEXT,
      "Секретный офис",
      SECRET_REF,
      "chat-",
      BOT_TOKEN,
      ...people.map((who) => who.id),
    ]) {
      expect(text).not.toContain(secret);
    }
  });

  it("с токеном бота строки «бот выключен» нет", () => {
    expect(formatBot({ enabled: true, kinds: [] }).join("\n")).not.toContain(
      "выключен",
    );
    expect(formatBot({ enabled: false, kinds: [] }).join("\n")).toContain(
      "бот выключен",
    );
  });

  it("игра на 5, двое вошли через Telegram — «могут получать бота: 2 из 5»", async () => {
    const owner = await person("Айгерим");
    const others: Person[] = [];
    for (const name of ["Азамат", "Нурай", "Бакыт", "Данияр"]) {
      others.push(await person(name));
    }
    await santaWith(owner, others);
    await linkTelegram(owner, "chat-1");
    await linkTelegram(others[0] as Person, "chat-2");
    // Выключил сообщения и заблокировал бота — не в счёт.
    await linkTelegram(others[1] as Person, "chat-3", { botMessages: false });
    await linkTelegram(others[2] as Person, "chat-4", {
      botBlockedAt: new Date(NOW),
    });
    const text = (await report(TOKEN)).body;
    expect(text).toContain("5 участников");
    expect(text).toContain("могут получать бота: 2 из 5");
    expect(text).not.toContain("chat-");
  });
});

describe("отчёт пилота по HTTPS (M03)", () => {
  it("?pilot=1 — текст пилота без id и имён; неверный код игры — 400; без токена — 404", async () => {
    const owner = await person("Айгерим");
    const ok = await reportWith("pilot=1&since=2026-11-01");
    expect(ok.statusCode).toBe(200);
    expect(ok.body).toContain("Отчёт пилота SwipeIt");
    expect(ok.body).not.toContain(owner.id);
    expect(ok.body).not.toContain("Айгерим");
    expect(ok.body.length).toBeLessThanOrEqual(4096);

    expect(
      (await reportWith("pilot=1&since=2026-11-01&game=AAAAAAAAAA")).statusCode,
    ).toBe(400);

    const bare = await app.inject({
      method: "GET",
      url: "/v1/ops/report?pilot=1&since=2026-11-01",
    });
    expect(bare.statusCode).toBe(404);
  });
});
