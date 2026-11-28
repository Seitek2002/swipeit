import { toDateKey } from "@swipeit/core/format";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { errorsDaily, users } from "../src/db/schema";
import {
  buildPilotReport,
  formatPilot,
  type PilotData,
  type PilotOptions,
  TELEGRAM_LIMIT,
} from "../src/domains/funnel/pilot";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer, makeClock, type TestUser } from "./server";

// Отчёт пилота одной командой (auto-tasks-metrics-1 M03).
const database = createTestDb();
afterAll(() => database.close());

let clock: ReturnType<typeof makeClock>;
let server: Awaited<ReturnType<typeof createTestServer>>;
beforeEach(async () => {
  await resetDb(database);
  clock = makeClock();
  server = await createTestServer(database, clock);
});
afterEach(() => server.close());

const HOUR = 3600_000;
const DAY = 24 * HOUR;
const TITLE = "Секретный офис";

const report = async (options: Partial<PilotOptions> = {}) => {
  const result = await buildPilotReport(database.db, {
    since: toDateKey(NOW),
    now: clock.now(),
    timeZone: "Asia/Bishkek",
    ...options,
  });
  if (!result.ok) throw new Error(result.message);
  return result.text;
};

const swipeLikes = async (user: TestUser, count: number) => {
  const { products } = await testCatalog();
  for (const product of products.slice(0, count)) {
    await server.request(user, "POST", "/swipes", {
      productId: product.id,
      decision: "like",
      context: { kind: "self" },
    });
  }
};

const newVia = async (via: string, name: string): Promise<TestUser> => {
  const created = (
    await server.request(null, "POST", "/users", { via })
  ).json() as { me: { id: string }; token: string };
  const user = { id: created.me.id, token: created.token };
  await server.request(user, "PATCH", "/me", { name });
  return user;
};

// Офис на 6: организатор и пятеро по приглашению. Через 2 ч после ссылки
// вступили, жеребьёвка, через 1 ч пятеро открыли письмо, двое купили. Один
// отправил свой вишлист, и его открыл человек не из игры.
const office = async (exchangeDate = "2026-12-25") => {
  const owner = await server.newUser({ name: "Айгерим" });
  const created = (
    await server.request(owner, "POST", "/santa", {
      title: TITLE,
      budget: 2000,
      exchangeDate,
      participantIds: [],
    })
  ).json() as { game: { id: string } };
  const id = created.game.id;
  const { code } = (
    await server.request(owner, "POST", "/share-links", {
      kind: "santa",
      targetId: id,
    })
  ).json() as { code: string };
  clock.advance(2 * HOUR);
  const members: TestUser[] = [];
  for (const name of ["Азамат", "Нурай", "Бакыт", "Данияр", "Эрмек"]) {
    const member = await newVia("santa_invite", name);
    await server.request(member, "POST", `/santa/${id}/join`);
    members.push(member);
  }
  const sharer = members[0] as TestUser;
  await swipeLikes(sharer, 5);
  const share = (
    await server.request(sharer, "POST", "/wishlist/share")
  ).json() as { code: string };
  const outsider = await newVia("feed", "Чужой");
  await server.request(outsider, "GET", `/share/${share.code}`);

  expect(
    (await server.request(owner, "POST", `/santa/${id}/draw`)).statusCode,
  ).toBe(200);
  clock.advance(HOUR);
  const openers = [owner, ...members.slice(0, 4)];
  for (const person of openers) {
    await server.request(person, "POST", `/santa/${id}/open`);
  }
  for (const person of openers.slice(0, 2)) {
    await server.request(person, "POST", `/santa/${id}/bought`, {
      bought: true,
    });
  }
  return { id, code, owner, members, outsider, shareCode: share.code };
};

describe("отчёт пилота (M03)", () => {
  it("игра офиса: вступили, письма, покупки, сроки, когорта; без id, имён, названия и кода", async () => {
    const game = await office();
    const text = await report({ gameCode: game.code });

    expect(text).toContain("Санта — игра по коду, обмен 25.12.2026");
    expect(text).toContain(
      "вступили 6 из 6 (100%) позванных; от ссылки до вступления — 2 ч (медиана)",
    );
    expect(text).toContain(
      "открыли письмо 5 из 6 (83%); от жеребьёвки до письма — 1 ч (медиана)",
    );
    expect(text).toContain(
      "купили 2 из 6 (33%), из них до обмена 2, из вишлиста подопечного 0",
    );
    // Снимок при жеребьёвке (M04): вишлист был только у одного.
    expect(text).toMatch(
      /к жеребьёвке: с вишлистом 1 из 6 \(17%\), 3\+ желания в бюджете \d из 6 \(\d+%\), позваны и не вступили 0/,
    );
    expect(text).toContain(
      "с пустым вишлистом (их Санте не из чего выбрать): 5",
    );
    expect(text).toMatch(/новых профилей: 7 — по приглашению в Санту 5/);
    expect(text).toContain("пришли: 5");
    expect(text).toContain("отправили свой вишлист: 1 из 5 (20%)");
    expect(text).toContain("их вишлист открыли люди не из игры: 1 из 5 (20%)");
    expect(text).toContain("заходили после обмена: обмен ещё не прошёл");
    expect(text).toContain(
      "компаний (3+ не своих человека дошли до «Решено» или жеребьёвки): 1",
    );

    // Без кода — та же игра как самая большая за период.
    expect(await report()).toContain(
      "самая большая игра периода (всего игр: 1)",
    );

    for (const secret of [
      game.id,
      game.code,
      game.shareCode,
      game.owner.id,
      game.outsider.id,
      ...game.members.map((member) => member.id),
      TITLE,
      "Айгерим",
      "Азамат",
      "Чужой",
    ]) {
      expect(text).not.toContain(secret);
    }
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(text).not.toMatch(/[a-z0-9]+_[a-z0-9_]+/i);
  });

  it("игра из своих профилей не видна; с includeInternal — видна", async () => {
    const game = await office();
    for (const person of [game.owner, ...game.members]) {
      await database.db
        .update(users)
        .set({ funnelInternal: true })
        .where(eq(users.id, person.id));
    }
    const plain = await report();
    expect(plain).toContain(
      "Санта — игр с не своими участниками за период нет",
    );
    expect(plain).not.toContain("вступили");
    // По коду игра найдётся, но своих в ней не считаем.
    expect(await report({ gameCode: game.code })).toContain(
      "в игре 0 чел. — меньше 5, мало данных",
    );
    const internal = await report({ includeInternal: true });
    expect(internal).toContain("Со своими профилями и репетицией");
    expect(internal).toContain("вступили 6 из 6");
    expect(internal).toContain("открыли письмо 5 из 6");
    expect(internal).toContain("купили 2 из 6");
  });

  it("игра с обменом 30 дней назад — в отчёте по коду; без кода её нет", async () => {
    clock = makeClock(NOW - 40 * DAY);
    await server.close();
    server = await createTestServer(database, clock);
    const game = await office(toDateKey(NOW - 30 * DAY));
    clock = makeClock(NOW);
    const text = await report({ gameCode: game.code });
    expect(text).toContain(
      `Санта — игра по коду, обмен ${toDateKey(NOW - 30 * DAY)
        .split("-")
        .reverse()
        .join(".")}`,
    );
    expect(text).toContain("вступили 6 из 6");
    expect(text).toContain("купили 2 из 6");
    expect(await report()).toContain(
      "Санта — игр с не своими участниками за период нет",
    );
  });

  it("код не приглашения в игру — понятная ошибка", async () => {
    const game = await office();
    for (const gameCode of ["NoSuchCode", game.shareCode]) {
      expect(
        await buildPilotReport(database.db, {
          since: toDateKey(NOW),
          now: NOW,
          timeZone: "Asia/Bishkek",
          gameCode,
        }),
      ).toEqual({ ok: false, message: "Нет приглашения в игру с таким кодом" });
    }
  });

  it("сбои за период — по-русски, без своих; со своими — все", async () => {
    await database.db.insert(errorsDaily).values([
      { day: toDateKey(NOW), code: "CONFLICT", count: 5, internal: 3 },
      { day: toDateKey(NOW), code: "INTERNAL", count: 1, internal: 0 },
      { day: toDateKey(NOW - DAY), code: "INTERNAL", count: 4, internal: 0 },
    ]);
    const text = await report();
    expect(text).toContain("конфликт 2, сбой сервера 1");
    expect(text).not.toContain("CONFLICT");
    expect(await report({ includeInternal: true })).toContain(
      "конфликт 5, сбой сервера 1",
    );
  });
});

// Самый длинный отчёт, какой бывает: все via, все причины бота, сбои каждый
// день месяца, снимок и шаги M10.
const longest: PilotData = {
  since: "2026-12-01",
  until: "2026-12-31",
  includeInternal: true,
  botEnabled: true,
  people: {
    byVia: [
      "feed",
      "wishlist_link",
      "reservation",
      "santa_invite",
      "plan_invite",
      "pick_link",
      null,
      "something_new",
    ].map((via, index) => ({ via, count: 1000 + index })),
    idle: 9999,
    deleted: 9999,
    telegram: 9999,
    merged: 9999,
    restored: 9999,
    returnedD1: 9999,
    returnedD7: 9999,
  },
  santa: {
    byCode: false,
    gamesInPeriod: 999,
    exchangeDate: "2026-12-25",
    exchangePassed: true,
    drawn: true,
    invited: 9999,
    joined: 9999,
    joinHours: 9999,
    opened: 9999,
    openHours: 0.2,
    bought: 9999,
    boughtBeforeExchange: 9999,
    boughtFromWishlist: 9999,
    emptyWishlist: 9999,
    removed: 9999,
    snapshot: {
      members: 9999,
      invitedDropped: 9999,
      withWishlist: 9999,
      enoughInBudget: 9999,
    },
    bot: {
      sent: 9999,
      waiting: 9999,
      failed: 9999,
      reasons: [
        "blocked",
        "no_chat",
        "disabled",
        "network",
        "sender",
        "http_500",
        "http_429",
        "unknown",
      ].map((reason) => ({ reason, count: 999 })),
    },
  },
  cohort: {
    size: 9999,
    shared: 9999,
    outsiders: 9999,
    plans: 9999,
    returned: 9999,
  },
  goals: {
    companies: 99,
    steps: {
      first_swipe: 9999,
      first_swipe_feed: 9999,
      first_swipe_10s: 9999,
      swipes_20: 9999,
      wishlist_shared: 9999,
      share_with_birthday: 9999,
      share_channel_system: 9999,
      share_channel_copy: 9999,
      share_channel_qr: 9999,
    },
  },
  errors: {
    byCode: [
      "INTERNAL",
      "RATE_LIMITED",
      "UNAUTHORIZED",
      "FORBIDDEN",
      "CONFLICT",
      "VALIDATION",
      "NOT_FOUND",
      "HEALTH_503",
      "SOMETHING_ELSE",
    ].map((code) => ({ code, count: 99_999 })),
    byDay: Array.from({ length: 31 }, (_, index) => ({
      day: `2026-12-${String(index + 1).padStart(2, "0")}`,
      count: 9999,
    })),
  },
};

describe("текст отчёта пилота", () => {
  it("самый длинный отчёт влезает в одно сообщение Telegram, без snake_case", () => {
    const text = formatPilot(longest);
    expect(text.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(text).not.toMatch(/[a-z0-9]+_[a-z0-9_]+/i);
    expect(text).toContain("к жеребьёвке: с вишлистом");
    expect(text).toContain("из вишлиста подопечного 9999");
    expect(text).toContain(
      "пустые дубли, брошенные при входе через Telegram: 9999",
    );
    expect(text).toContain(
      "вернулись на другой день и позже: 9999, через неделю и позже: 9999",
    );
  });

  it("маленькая игра и маленькая когорта — «мало данных», без долей", () => {
    const santa = longest.santa;
    if (!santa) throw new Error("нет игры в образце");
    const text = formatPilot({
      ...longest,
      santa: { ...santa, joined: 3, invited: 3, opened: 1, bought: 1 },
      cohort: { size: 4, shared: 1, outsiders: 0, plans: 0, returned: 1 },
      goals: { companies: 0, steps: { first_swipe_feed: 2 } },
    });
    expect(text).toContain("в игре 3 чел. — меньше 5, мало данных");
    expect(text).not.toContain("купили 1 из 3");
    expect(text).toContain("пришли 4 чел. — меньше 5, мало данных");
    expect(text).toContain(
      "первый свайп за 10 секунд: мало данных (2 чел. из ленты)",
    );
  });

  it("бот выключен — так и написано", () => {
    expect(formatPilot({ ...longest, botEnabled: false })).toContain(
      "бот выключен: сообщения только в журнале",
    );
  });
});
