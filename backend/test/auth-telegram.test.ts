import type { MeResponse } from "@swipeit/core/api/users/types";
import { createSeededRandom } from "@swipeit/core/logic/random";
import { eq } from "drizzle-orm";
import { generateKeyPairSync, type KeyObject, sign } from "node:crypto";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import type { JwksSource } from "../src/auth/telegram";
import { loadConfig } from "../src/config";
import { identities, sessions, wishlistItems } from "../src/db/schema";
import { makeFriends } from "../src/domains/friends/handlers";
import { testConfig } from "./config";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { makeClock } from "./server";

// Вход через Telegram (BACKEND.md §3.3, auto-tasks-pm-4 S03) — без сети и без
// настоящего бота: свой ключ RS256 и подставной JWKS, токены подписываем
// сами так, как подписывает Telegram.
const database = createTestDb();
afterAll(() => database.close());

const CLIENT_ID = "7000000001";
const ISSUER = "https://oauth.telegram.org";
const SUB = "telegram-sub-5550001";
// Имя и username Telegram — в токене есть, но наружу не должны уйти никуда.
const TG_NAME = "Тестовый Телеграм";
const TG_USERNAME = "secret_tg_username";

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "P-256" });
const stranger = generateKeyPairSync("rsa", { modulusLength: 2048 });

const jwkOf = (key: KeyObject, kid: string, alg: string) => ({
  ...key.export({ format: "jwk" }),
  kid,
  alg,
  use: "sig",
});

let jwksCalls = 0;
const jwks: JwksSource = async () => {
  jwksCalls += 1;
  return [
    jwkOf(rsa.publicKey, "rsa-1", "RS256"),
    jwkOf(ec.publicKey, "ec-1", "ES256"),
  ];
};

const b64 = (value: object) =>
  Buffer.from(JSON.stringify(value)).toString("base64url");

type TokenOptions = {
  alg?: "ES256" | "RS256";
  claims?: Record<string, unknown>;
  key?: KeyObject;
  kid?: string;
};

// id_token так, как его подписывает Telegram: JWS compact, RS256 или ES256.
const idToken = (nonce: string, options: TokenOptions = {}) => {
  const alg = options.alg ?? "RS256";
  const header = b64({
    alg,
    kid: options.kid ?? (alg === "RS256" ? "rsa-1" : "ec-1"),
    typ: "JWT",
  });
  const nowS = Math.floor(clock.now() / 1000);
  const payload = b64({
    iss: ISSUER,
    aud: CLIENT_ID,
    sub: SUB,
    iat: nowS,
    exp: nowS + 3600,
    nonce,
    id: 5550001,
    name: TG_NAME,
    preferred_username: TG_USERNAME,
    ...options.claims,
  });
  const data = Buffer.from(`${header}.${payload}`);
  const signature =
    alg === "RS256"
      ? sign("sha256", data, options.key ?? rsa.privateKey)
      : sign("sha256", data, {
          key: options.key ?? ec.privateKey,
          dsaEncoding: "ieee-p1363",
        });
  return `${header}.${payload}.${signature.toString("base64url")}`;
};

let clock: ReturnType<typeof makeClock>;
let app: ReturnType<typeof buildApp>;

const makeApp = async (env: Record<string, string> = {}, config = testConfig) =>
  buildApp({
    config: config({ TELEGRAM_CLIENT_ID: CLIENT_ID, ...env }),
    db: database,
    catalog: await testCatalog(),
    clock,
    random: createSeededRandom("auth-telegram"),
    telegramJwks: jwks,
  });

beforeEach(async () => {
  await resetDb(database);
  clock = makeClock(NOW);
  jwksCalls = 0;
  app = await makeApp();
});
afterEach(() => app.close());

type Person = { id: string; token: string };

const call = (
  who: null | Person | string,
  method: "DELETE" | "GET" | "PATCH" | "POST",
  url: string,
  body?: object,
) => {
  const token = typeof who === "string" ? who : who?.token;
  return app.inject({
    method,
    url: `/v1${url}`,
    ...(body ? { payload: body } : {}),
    headers: token ? { authorization: `Bearer ${token}` } : {},
  });
};

const signUp = async (): Promise<Person> => {
  const response = await call(null, "POST", "/users");
  const { me, token } = response.json() as { me: MeResponse; token: string };
  return { id: me.id, token };
};

const nonce = async (who: null | Person = null) => {
  const response = await call(who, "POST", "/auth/telegram/nonce");
  expect(response.statusCode).toBe(200);
  return (response.json() as { nonce: string }).nonce;
};

const login = (who: null | Person, token: string, confirmSwitch?: boolean) =>
  call(who, "POST", "/auth/telegram", {
    idToken: token,
    ...(confirmSwitch === undefined ? {} : { confirmSwitch }),
  });

const addWish = async (who: Person, title: string) => {
  const response = await call(who, "POST", "/wishlist/items", { title });
  expect(response.statusCode).toBe(200);
};

const wishesOf = async (userId: string) =>
  database.db
    .select({ id: wishlistItems.id })
    .from(wishlistItems)
    .where(eq(wishlistItems.ownerId, userId));

describe("вход через Telegram: настройка", () => {
  it("без TELEGRAM_CLIENT_ID — 404, как будто маршрутов нет", async () => {
    await app.close();
    app = buildApp({
      config: testConfig(),
      db: database,
      catalog: await testCatalog(),
      clock,
      random: createSeededRandom("auth-telegram"),
      telegramJwks: jwks,
    });
    const person = await signUp();
    expect(
      (await call(person, "POST", "/auth/telegram/nonce")).statusCode,
    ).toBe(404);
    const response = await login(person, idToken("x"));
    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({ code: "NOT_FOUND" });
  });

  it("пустая строка TELEGRAM_CLIENT_ID= — тоже «не задано»", () => {
    expect(
      loadConfig({ TELEGRAM_CLIENT_ID: "" }).TELEGRAM_CLIENT_ID,
    ).toBeUndefined();
    expect(() => loadConfig({ TELEGRAM_CLIENT_ID: "abc" })).toThrow(
      /TELEGRAM_CLIENT_ID/,
    );
  });
});

describe("вход через Telegram: привязка и второй телефон", () => {
  it("верный токен на чистом профиле → привязка, данные на месте, в базе только sub", async () => {
    const first = await signUp();
    await call(first, "PATCH", "/me", { name: "Айдана" });
    await addWish(first, "Плед");

    const response = await login(first, idToken(await nonce(first)));
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      me: MeResponse;
      status: string;
      token?: string;
    };
    expect(body.status).toBe("linked");
    expect(body.token).toBeUndefined();
    expect(body.me).toMatchObject({
      id: first.id,
      name: "Айдана",
      telegramLinked: true,
    });

    // Тот же токен сессии работает, имя из Telegram своё не перезаписало.
    const me = (await call(first, "GET", "/me")).json() as MeResponse;
    expect(me).toMatchObject({
      id: first.id,
      name: "Айдана",
      telegramLinked: true,
    });
    expect(await wishesOf(first.id)).toHaveLength(1);

    const rows = await database.db.select().from(identities);
    expect(rows).toEqual([
      {
        userId: first.id,
        provider: "telegram",
        subject: SUB,
        createdAt: expect.any(Date),
      },
    ]);
  });

  it("без привязки в /me нет telegramLinked", async () => {
    const person = await signUp();
    const me = (await call(person, "GET", "/me")).json() as MeResponse;
    expect(me.telegramLinked).toBeUndefined();
  });

  it("повторный вход тем же Telegram на том же профиле — linked, без новой сессии", async () => {
    const first = await signUp();
    await login(first, idToken(await nonce(first)));
    const again = await login(first, idToken(await nonce(first)));
    expect(again.json()).toMatchObject({
      status: "linked",
      me: { id: first.id },
    });
    expect(await database.db.select().from(sessions)).toHaveLength(1);
  });

  it("тот же sub с другого профиля с желаниями → сначала confirm, потом сессия на первый; желания второго целы", async () => {
    const first = await signUp();
    await call(first, "PATCH", "/me", { name: "Айдана" });
    await addWish(first, "Плед");
    await login(first, idToken(await nonce(first)));

    const second = await signUp();
    await addWish(second, "Шарф");
    await addWish(second, "Книга");
    const token = idToken(await nonce(second));

    const ask = await login(second, token);
    expect(ask.statusCode).toBe(200);
    expect(ask.json()).toEqual({ status: "confirm", localWishes: 2 });
    // Ничего не изменилось: второй телефон в своём профиле.
    expect(((await call(second, "GET", "/me")).json() as MeResponse).id).toBe(
      second.id,
    );

    // Тот же токен с согласием — nonce ещё действует.
    const switched = await login(second, token, true);
    expect(switched.statusCode).toBe(200);
    const body = switched.json() as {
      me: MeResponse;
      status: string;
      token: string;
    };
    expect(body.status).toBe("switched");
    expect(body.me).toMatchObject({
      id: first.id,
      name: "Айдана",
      telegramLinked: true,
    });

    const me = (await call(body.token, "GET", "/me")).json() as MeResponse;
    expect(me.id).toBe(first.id);
    const wishlist = (await call(body.token, "GET", "/wishlist")).json() as {
      items: Array<{ custom?: { title: string } }>;
    };
    expect(JSON.stringify(wishlist)).toContain("Плед");

    // Профиль второго телефона остался как есть — с желаниями; его сессия
    // закрыта (телефон забыл токен).
    expect(await wishesOf(second.id)).toHaveLength(2);
    expect((await call(second, "GET", "/me")).statusCode).toBe(401);
    // Первый телефон по-прежнему в профиле.
    expect(((await call(first, "GET", "/me")).json() as MeResponse).id).toBe(
      first.id,
    );
  });

  it("второй телефон без желаний — переключение сразу", async () => {
    const first = await signUp();
    await login(first, idToken(await nonce(first)));
    const second = await signUp();
    const response = await login(second, idToken(await nonce(second)));
    expect(response.json()).toMatchObject({
      status: "switched",
      me: { id: first.id },
    });
  });

  it("«Сессия закончилась» (токена нет или он закрыт): вход открывает профиль Telegram", async () => {
    const first = await signUp();
    await addWish(first, "Плед");
    await login(first, idToken(await nonce(first)));

    const response = await login(null, idToken(await nonce()));
    const body = response.json() as {
      me: MeResponse;
      status: string;
      token: string;
    };
    expect(body.status).toBe("switched");
    expect(body.me.id).toBe(first.id);

    // Старый неверный токен в заголовке не мешает: маршрут открытый.
    const stale = await login(
      { id: "u_x", token: "закрытый-токен" },
      idToken(await nonce()),
    );
    expect(stale.json()).toMatchObject({
      status: "switched",
      me: { id: first.id },
    });
  });

  it("без профиля и без привязки — новый профиль, сразу с Telegram", async () => {
    const response = await login(null, idToken(await nonce()));
    expect(response.statusCode).toBe(200);
    const body = response.json() as {
      me: MeResponse;
      status: string;
      token: string;
    };
    expect(body.status).toBe("created");
    expect(body.me.telegramLinked).toBe(true);
    expect(body.me.name).toBeUndefined();
    const me = (await call(body.token, "GET", "/me")).json() as MeResponse;
    expect(me).toMatchObject({ id: body.me.id, telegramLinked: true });
  });

  it("профиль уже привязан к другому Telegram — 409", async () => {
    const person = await signUp();
    await login(person, idToken(await nonce(person)));
    const other = await login(
      person,
      idToken(await nonce(person), { claims: { sub: "another-sub" } }),
    );
    expect(other.statusCode).toBe(409);
    expect(other.json()).toMatchObject({ code: "CONFLICT" });
  });

  it("удалённый профиль отвязывает Telegram: вход создаёт новый", async () => {
    const first = await signUp();
    await login(first, idToken(await nonce(first)));
    expect((await call(first, "DELETE", "/me")).statusCode).toBe(200);
    const response = await login(null, idToken(await nonce()));
    const body = response.json() as { me: MeResponse; status: string };
    expect(body.status).toBe("created");
    expect(body.me.id).not.toBe(first.id);
  });

  it("ES256 — тоже принимается", async () => {
    const person = await signUp();
    const response = await login(
      person,
      idToken(await nonce(person), { alg: "ES256" }),
    );
    expect(response.json()).toMatchObject({ status: "linked" });
  });
});

describe("вход через Telegram: неверные токены → 401", () => {
  const rejected = async (make: (nonce: string) => string) => {
    const person = await signUp();
    const response = await login(person, make(await nonce(person)));
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({ code: "UNAUTHORIZED" });
    // 401 входа не закрывает сессию этого телефона.
    expect((await call(person, "GET", "/me")).statusCode).toBe(200);
    expect(await database.db.select().from(identities)).toHaveLength(0);
  };

  it("подделанная подпись (чужой ключ с тем же kid)", () =>
    rejected((n) => idToken(n, { key: stranger.privateKey })));

  it("подменённые данные под верной подписью", () =>
    rejected((n) => {
      const [header, , signature] = idToken(n).split(".");
      const forged = b64({
        iss: ISSUER,
        aud: CLIENT_ID,
        sub: "someone-else",
        exp: 9_999_999_999,
        nonce: n,
      });
      return `${header}.${forged}.${signature}`;
    }));

  it("просроченный токен", () =>
    rejected((n) =>
      idToken(n, {
        claims: { exp: Math.floor(clock.now() / 1000) - 3600 },
      }),
    ));

  it("чужой aud", () =>
    rejected((n) => idToken(n, { claims: { aud: "7000000002" } })));

  it("чужой iss", () =>
    rejected((n) => idToken(n, { claims: { iss: "https://evil.example" } })));

  it("неизвестный kid", () => rejected((n) => idToken(n, { kid: "nope" })));

  it("alg none", () =>
    rejected((n) => {
      const [, payload] = idToken(n).split(".");
      return `${b64({ alg: "none", kid: "rsa-1" })}.${payload}.`;
    }));

  it("RS256-ключ под видом ES256", () =>
    rejected((n) => {
      const token = idToken(n);
      const [, payload, signature] = token.split(".");
      return `${b64({ alg: "ES256", kid: "rsa-1" })}.${payload}.${signature}`;
    }));

  it("nonce, который сервер не выдавал", () =>
    rejected(() => idToken("выдуманный")));

  it("без nonce", () =>
    rejected(() => idToken("", { claims: { nonce: undefined } })));

  it("не JWT", () => rejected(() => "abc.def"));

  it("nonce старше 10 минут", async () => {
    const person = await signUp();
    const n = await nonce(person);
    clock.advance(11 * 60_000);
    const response = await login(person, idToken(n));
    expect(response.statusCode).toBe(401);
  });

  it("повтор nonce (тот же токен второй раз) → 401", async () => {
    const person = await signUp();
    const token = idToken(await nonce(person));
    expect((await login(person, token)).statusCode).toBe(200);
    const again = await login(person, token);
    expect(again.statusCode).toBe(401);
    // И с другого телефона тоже.
    const other = await signUp();
    expect((await login(other, token)).statusCode).toBe(401);
    expect((await login(null, token)).statusCode).toBe(401);
  });
});

describe("вход через Telegram: ключи и лимиты", () => {
  it("ключи Telegram не скачались — 503 OFFLINE, а не «неверный токен»", async () => {
    await app.close();
    app = buildApp({
      config: testConfig({ TELEGRAM_CLIENT_ID: CLIENT_ID }),
      db: database,
      catalog: await testCatalog(),
      clock,
      random: createSeededRandom("auth-telegram"),
      telegramJwks: () => Promise.reject(new Error("нет сети")),
    });
    const person = await signUp();
    const response = await login(person, idToken(await nonce(person)));
    expect(response.statusCode).toBe(503);
    expect(response.json()).toMatchObject({ code: "OFFLINE" });
  });

  it("JWKS кешируется: десять входов — одна загрузка", async () => {
    for (let i = 0; i < 10; i += 1) {
      const person = await signUp();
      await login(
        person,
        idToken(await nonce(person), { claims: { sub: `s${i}` } }),
      );
    }
    expect(jwksCalls).toBe(1);
  });

  it("20 в минуту с IP даже с разными сессиями, потом 429", async () => {
    await app.close();
    app = await makeApp({ LOG_LEVEL: "silent" }, (env) =>
      loadConfig({
        ...env,
        RATE_USERS_MINUTE: "1000",
        RATE_ALL_IP: "1000",
        RATE_ALL_SESSION: "1000",
      }),
    );
    const people = await Promise.all(Array.from({ length: 3 }, () => signUp()));
    const statuses: number[] = [];
    for (let i = 0; i < 21; i += 1) {
      const who = people[i % people.length] ?? null;
      statuses.push(
        (await call(who, "POST", "/auth/telegram/nonce")).statusCode,
      );
    }
    expect(statuses.slice(0, 20).every((status) => status === 200)).toBe(true);
    expect(statuses[20]).toBe(429);
  });
});

describe("вход через Telegram: приватность", () => {
  it("друзья не видят ни sub, ни имени, ни username Telegram, ни самого факта привязки", async () => {
    const owner = await signUp();
    await call(owner, "PATCH", "/me", { name: "Айдана" });
    await addWish(owner, "Плед");
    await login(owner, idToken(await nonce(owner)));
    const friend = await signUp();
    await call(friend, "PATCH", "/me", { name: "Бакыт" });
    await database.db.transaction((tx) =>
      makeFriends(tx, owner.id, friend.id, "plan", clock),
    );

    const seen = [
      await call(friend, "GET", `/users/${owner.id}`),
      await call(friend, "GET", "/friends"),
      await call(friend, "GET", `/users/${owner.id}/wishlist`),
    ];
    for (const response of seen) {
      expect(response.statusCode).toBe(200);
      const text = response.body;
      expect(text).toContain("Айдана");
      for (const secret of [
        SUB,
        "5550001",
        TG_NAME,
        TG_USERNAME,
        "telegram",
        "Telegram",
      ]) {
        expect(text).not.toContain(secret);
      }
    }

    // И себе — только флаг, без id и имени из Telegram.
    const own = (await call(owner, "GET", "/me")).body;
    for (const secret of [SUB, "5550001", TG_NAME, TG_USERNAME]) {
      expect(own).not.toContain(secret);
    }
  });
});
