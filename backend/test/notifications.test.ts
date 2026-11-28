import { createSeededRandom } from "@swipeit/core/logic/random";
import { and, eq, isNotNull } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { loadConfig } from "../src/config";
import { funnelDaily, identities, notifications } from "../src/db/schema";
import { makeFriends } from "../src/domains/friends/handlers";
import {
  createLogSender,
  createTelegramSender,
  type NotificationSender,
  type OutgoingMessage,
  type SendResult,
} from "../src/domains/notifications/sender";
import { createRecordingHub } from "../src/realtime/hub";
import { runSchedulerOnce } from "../src/scheduler";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer, makeClock, type TestUser } from "./server";

// Уведомления Telegram-ботом (auto-tasks-pm-4 S10): очередь, тексты и
// отправка — с подставными часами и подставным транспортом, без сети.
const database = createTestDb();
afterAll(() => database.close());

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const APP_URL = "https://swipeit.example";

// Подставной транспорт: что отправили и что ответить.
const fakeSender = () => {
  const sent: OutgoingMessage[] = [];
  let reply: (message: OutgoingMessage) => SendResult = () => ({ ok: true });
  const sender: NotificationSender = {
    mode: "telegram",
    send: async (message) => {
      const result = reply(message);
      if (result.ok) sent.push(message);
      return result;
    },
  };
  return {
    sender,
    sent,
    replyWith: (next: (message: OutgoingMessage) => SendResult) => {
      reply = next;
    },
  };
};

let clock: ReturnType<typeof makeClock>;
let server: Awaited<ReturnType<typeof createTestServer>>;
let bot: ReturnType<typeof fakeSender>;
beforeEach(async () => {
  await resetDb(database);
  clock = makeClock();
  server = await createTestServer(database, clock);
  bot = fakeSender();
});
afterEach(() => server.close());

const tick = async (sender: NotificationSender = bot.sender) =>
  runSchedulerOnce({
    db: database,
    catalog: await testCatalog(),
    clock,
    random: createSeededRandom("notifications"),
    hub: createRecordingHub(),
    log: server.app.log,
    notifications: { appUrl: APP_URL, sender },
  });

const NAMES = ["Айгерим", "Азамат", "Нурай", "Бакыт", "Эрмек"];

// Вошёл через Telegram: chat_id — id аккаунта.
const linkTelegram = (user: TestUser, chatId: string) =>
  database.db.insert(identities).values({
    userId: user.id,
    provider: "telegram",
    subject: `sub-${chatId}`,
    chatId,
    createdAt: new Date(NOW),
  });

const people = async (count = 5) => {
  const created: TestUser[] = [];
  for (const name of NAMES.slice(0, count)) {
    created.push(await server.newUser({ name }));
  }
  const [owner, ...rest] = created;
  if (!owner) throw new Error("нет организатора");
  for (const friend of rest) {
    await database.db.transaction((tx) =>
      makeFriends(tx, owner.id, friend.id, "plan", { now: () => NOW }),
    );
  }
  return { owner, rest, all: [owner, ...rest] };
};

const createGame = async (
  owner: TestUser,
  rest: TestUser[],
  extra: Record<string, unknown> = {},
) => {
  const response = await server.request(owner, "POST", "/santa", {
    title: "Офис",
    budget: 2000,
    exchangeDate: "2026-12-25",
    drawMode: "manual",
    participantIds: rest.map((user) => user.id),
    ...extra,
  });
  expect(response.statusCode).toBe(200);
  const id = (response.json() as { game: { id: string } }).game.id;
  for (const user of rest) {
    expect(
      (await server.request(user, "POST", `/santa/${id}/join`)).statusCode,
    ).toBe(200);
  }
  return id;
};

const queue = () => database.db.select().from(notifications);

describe("S10: уведомления ботом", () => {
  it("жеребьёвка на 5, у троих Telegram → 3 сообщения; повтор планировщика → всё ещё 3", async () => {
    const { owner, rest, all } = await people();
    await linkTelegram(owner, "1001");
    await linkTelegram(rest[0] as TestUser, "1002");
    await linkTelegram(rest[1] as TestUser, "1003");
    const id = await createGame(owner, rest);
    const drawn = await server.request(owner, "POST", `/santa/${id}/draw`);
    expect(drawn.statusCode).toBe(200);

    await tick();
    expect(bot.sent.map((m) => m.chatId).sort()).toEqual([
      "1001",
      "1002",
      "1003",
    ]);
    for (let index = 0; index < 5; index += 1) await tick();
    expect(bot.sent).toHaveLength(3);
    expect(await queue()).toHaveLength(3);

    const [message] = bot.sent;
    expect(message?.text).toBe(
      "Тайный Санта „Офис“: жеребьёвка прошла. Открой письмо — там, кому ты даришь",
    );
    expect(message?.link).toEqual({
      label: "Открыть игру",
      url: `${APP_URL}/santa/game/?id=${id}`,
    });
    // Ни имён, ни id участников в текстах.
    for (const sent of bot.sent) {
      for (const name of NAMES) expect(sent.text).not.toContain(name);
      for (const user of all) expect(sent.text).not.toContain(user.id);
    }
    // Воронка — только число.
    const [row] = await database.db
      .select()
      .from(funnelDaily)
      .where(eq(funnelDaily.step, "notification_sent"));
    expect(row?.count).toBe(3);
  });

  it("жеребьёвка по дате — тоже сообщения; не прошла — организатору, без причины", async () => {
    const { owner, rest } = await people(3);
    await linkTelegram(owner, "2001");
    await linkTelegram(rest[0] as TestUser, "2002");
    const drawAt = new Date(NOW + HOUR).toISOString();
    const id = await createGame(owner, rest, { drawMode: "date", drawAt });
    clock.advance(2 * HOUR);
    expect((await tick()).drawn).toEqual([id]);
    await tick();
    expect(bot.sent.map((m) => m.chatId).sort()).toEqual(["2001", "2002"]);

    // Игра на двоих: жеребьёвка по дате не прошла.
    const pair = await people(2);
    await linkTelegram(pair.owner, "2101");
    await linkTelegram(pair.rest[0] as TestUser, "2102");
    const failedId = await createGame(pair.owner, pair.rest, {
      title: "Двое",
      drawMode: "date",
      drawAt: new Date(clock.now() + HOUR).toISOString(),
    });
    clock.advance(2 * HOUR);
    for (let index = 0; index < 5; index += 1) await tick();
    const failed = bot.sent.filter((m) => m.kind === "santa_draw_failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.chatId).toBe("2101");
    expect(failed[0]?.text).toBe(
      "„Двое“: жеребьёвка по дате не прошла — загляни в игру",
    );
    expect(failed[0]?.link?.url).toContain(failedId);
  });

  it("«Убрать» после жеребьёвки — новому Санте «новое письмо», без имён", async () => {
    const { owner, rest, all } = await people(4);
    for (const [index, user] of all.entries()) {
      await linkTelegram(user, `300${index}`);
    }
    const id = await createGame(owner, rest);
    await server.request(owner, "POST", `/santa/${id}/draw`);
    await tick();
    bot.sent.length = 0;
    const target = rest[2] as TestUser;
    const removed = await server.request(
      owner,
      "DELETE",
      `/santa/${id}/members/${target.id}`,
    );
    expect(removed.statusCode).toBe(200);
    await tick();
    expect(bot.sent).toHaveLength(1);
    expect(bot.sent[0]?.kind).toBe("santa_new_letter");
    expect(bot.sent[0]?.text).toBe("„Офис“: у тебя новое письмо — открой его");
    expect(bot.sent[0]?.chatId).not.toBe(
      `300${all.findIndex((u) => u.id === target.id)}`,
    );
    // В ключах очереди — только адресат: кого убрали, не видно.
    for (const row of await queue()) {
      if (row.userId !== target.id) {
        expect(row.dedupeKey).not.toContain(target.id);
      }
    }
  });

  it("за 3 дня до обмена — только тем, кто не отметил «купил»", async () => {
    const { owner, rest, all } = await people(4);
    for (const [index, user] of all.entries()) {
      await linkTelegram(user, `400${index}`);
    }
    // NOW — 28.11, 12:00 по Бишкеку: до обмена 1.12 — три дня.
    const id = await createGame(owner, rest, { exchangeDate: "2026-12-01" });
    await server.request(owner, "POST", `/santa/${id}/draw`);
    const buyer = rest[0] as TestUser;
    await server.request(buyer, "POST", `/santa/${id}/open`);
    await server.request(buyer, "POST", `/santa/${id}/bought`, {
      bought: true,
    });
    await tick();
    await tick();
    const soon = bot.sent.filter((m) => m.kind === "santa_exchange_soon");
    expect(soon.map((m) => m.chatId).sort()).toEqual(
      ["4000", "4002", "4003"].sort(),
    );
    expect(soon[0]?.text).toBe(
      "До обмена в „Офис“ 3 дня. Подарок уже есть? Отметь в игре или загляни в вишлист подопечного",
    );
    // Назавтра (осталось 2 дня) повтора нет: одно напоминание на дату обмена.
    clock.advance(DAY);
    await tick();
    expect(
      bot.sent.filter((m) => m.kind === "santa_exchange_soon"),
    ).toHaveLength(3);
  });

  it("завтра жеребьёвка — тем, у кого меньше 3 желаний в бюджете", async () => {
    const { owner, rest, all } = await people(3);
    for (const [index, user] of all.entries()) {
      await linkTelegram(user, `500${index}`);
    }
    const ready = rest[0] as TestUser;
    for (const title of ["Книга", "Шарф", "Кружка"]) {
      await server.request(ready, "POST", "/wishlist/items", {
        title,
        priceMin: 500,
      });
    }
    // Жеребьёвка завтра в 12:00; сегодня — день, время напоминать.
    await createGame(owner, rest, {
      drawMode: "date",
      drawAt: new Date(NOW + DAY).toISOString(),
    });
    await tick();
    await tick();
    const tomorrow = bot.sent.filter((m) => m.kind === "santa_draw_tomorrow");
    expect(tomorrow.map((m) => m.chatId).sort()).toEqual(["5000", "5002"]);
    expect(tomorrow[0]?.text).toBe(
      "Завтра жеребьёвка в „Офис“. Добавь пару желаний — твоему Санте будет проще",
    );
  });

  it("итоги плана «До даты» — участникам с Telegram", async () => {
    const { owner, rest } = await people(2);
    await linkTelegram(owner, "6001");
    await linkTelegram(rest[0] as TestUser, "6002");
    const created = (
      await server.request(owner, "POST", "/plans", {
        title: "Пятница вечером",
        mode: "deadline",
        deadline: new Date(NOW + HOUR).toISOString(),
        participantIds: rest.map((user) => user.id),
        filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
      })
    ).json() as { plan: { id: string } };
    clock.advance(2 * HOUR);
    await tick();
    await tick();
    const results = bot.sent.filter((m) => m.kind === "plan_results");
    expect(results.map((m) => m.chatId).sort()).toEqual(["6001", "6002"]);
    expect(results[0]?.text).toBe(
      "Итоги „Пятница вечером“ готовы — смотри, куда хотят все",
    );
    expect(results[0]?.link).toEqual({
      label: "Открыть план",
      url: `${APP_URL}/plans/session/?id=${created.plan.id}`,
    });
  });

  it("403 → этому человеку больше не шлём", async () => {
    const { owner, rest } = await people(3);
    await linkTelegram(owner, "7001");
    await linkTelegram(rest[0] as TestUser, "7002");
    bot.replyWith((message) =>
      message.chatId === "7002" ? { ok: false, blocked: true } : { ok: true },
    );
    const id = await createGame(owner, rest);
    await server.request(owner, "POST", `/santa/${id}/draw`);
    await tick();
    expect(bot.sent.map((m) => m.chatId)).toEqual(["7001"]);
    const [identity] = await database.db
      .select()
      .from(identities)
      .where(eq(identities.chatId, "7002"));
    expect(identity?.botBlockedAt).toBeTruthy();

    // Следующее событие — заблокировавшему в очередь не встаёт.
    bot.replyWith(() => ({ ok: true }));
    const again = await createGame(owner, rest, { title: "Ещё" });
    await server.request(owner, "POST", `/santa/${again}/draw`);
    await tick();
    expect(bot.sent.map((m) => m.chatId)).toEqual(["7001", "7001"]);
    const me = (
      await server.request(rest[0] as TestUser, "GET", "/me")
    ).json() as { telegramBotMessages?: boolean };
    expect(me.telegramBotMessages).toBe(false);
  });

  it("выключенный переключатель → не шлём; без Telegram переключателя нет", async () => {
    const { owner, rest } = await people(3);
    await linkTelegram(owner, "8001");
    const off = await server.request(owner, "PATCH", "/me", {
      botMessages: false,
    });
    expect(off.statusCode).toBe(200);
    expect(off.json()).toMatchObject({
      telegramLinked: true,
      telegramBotMessages: false,
    });
    const id = await createGame(owner, rest);
    await server.request(owner, "POST", `/santa/${id}/draw`);
    await tick();
    expect(bot.sent).toHaveLength(0);

    const noTelegram = await server.request(
      rest[0] as TestUser,
      "PATCH",
      "/me",
      { botMessages: true },
    );
    expect(noTelegram.statusCode).toBe(400);
  });

  it("поставили в очередь, потом выключили — не уходит", async () => {
    const { owner, rest } = await people(3);
    await linkTelegram(owner, "8101");
    const id = await createGame(owner, rest);
    await server.request(owner, "POST", `/santa/${id}/draw`);
    await server.request(owner, "PATCH", "/me", { botMessages: false });
    await tick();
    expect(bot.sent).toHaveLength(0);
    const [row] = await queue();
    expect(row?.error).toBe("disabled");
    expect(row?.sentAt).toBeNull();
  });

  it("сбой сети — повтор позже, а не в каждом проходе", async () => {
    const { owner, rest } = await people(3);
    await linkTelegram(owner, "8201");
    let calls = 0;
    bot.replyWith(() => {
      calls += 1;
      return calls === 1 ? { ok: false, error: "network" } : { ok: true };
    });
    const id = await createGame(owner, rest);
    await server.request(owner, "POST", `/santa/${id}/draw`);
    await tick();
    await tick();
    expect(calls).toBe(1);
    clock.advance(2 * 60_000);
    await tick();
    expect(calls).toBe(2);
    expect(bot.sent).toHaveLength(1);
  });

  it("без токена: сообщение в логе, запись отмечена, в воронку не идёт", async () => {
    const logged: unknown[] = [];
    const sender = createLogSender({
      info: (...args: unknown[]) => {
        logged.push(args);
      },
    } as never);
    const { owner, rest } = await people(3);
    await linkTelegram(owner, "9001");
    const id = await createGame(owner, rest);
    await server.request(owner, "POST", `/santa/${id}/draw`);
    await tick(sender);
    expect(logged).toHaveLength(1);
    expect(JSON.stringify(logged)).toContain("жеребьёвка прошла");
    expect(JSON.stringify(logged)).not.toContain("9001");
    const sentRows = await database.db
      .select()
      .from(notifications)
      .where(
        and(
          eq(notifications.userId, owner.id),
          isNotNull(notifications.sentAt),
        ),
      );
    expect(sentRows).toHaveLength(1);
    const funnel = await database.db
      .select()
      .from(funnelDaily)
      .where(eq(funnelDaily.step, "notification_sent"));
    expect(funnel).toHaveLength(0);

    // Сервер стартует без токена; пустая строка — как будто переменной нет.
    expect(loadConfig({ TELEGRAM_BOT_TOKEN: "" }).TELEGRAM_BOT_TOKEN).toBe(
      undefined,
    );
  });

  it("удалил профиль — его очередь удалена", async () => {
    const { owner, rest } = await people(3);
    await linkTelegram(rest[0] as TestUser, "9101");
    const id = await createGame(owner, rest);
    await server.request(owner, "POST", `/santa/${id}/draw`);
    expect(await queue()).toHaveLength(1);
    await server.request(rest[0] as TestUser, "DELETE", "/me");
    expect(
      (await queue()).filter((row) => row.userId === rest[0]?.id),
    ).toHaveLength(0);
  });
});

describe("S10: транспорт Bot API (подставной fetch)", () => {
  const TOKEN = "123456:TEST-token-not-real-0000000000";
  const message: OutgoingMessage = {
    chatId: "42",
    kind: "santa_drawn",
    text: "текст",
    link: { label: "Открыть игру", url: `${APP_URL}/santa/game/?id=sg_1` },
  };
  const senderReplying = (status: number, body: object) => {
    const calls: { body: unknown; url: string }[] = [];
    const sender = createTelegramSender({
      apiUrl: "https://api.telegram.test",
      token: TOKEN,
      fetchImpl: async (url, init) => {
        calls.push({ url, body: JSON.parse(String(init.body)) });
        return new Response(JSON.stringify(body), { status });
      },
    });
    return { sender, calls };
  };

  it("sendMessage на chat_id, кнопка — ссылка на игру", async () => {
    const { sender, calls } = senderReplying(200, { ok: true });
    expect(await sender.send(message)).toEqual({ ok: true });
    expect(calls[0]?.url).toBe(
      `https://api.telegram.test/bot${TOKEN}/sendMessage`,
    );
    expect(calls[0]?.body).toMatchObject({
      chat_id: "42",
      text: "текст",
      reply_markup: {
        inline_keyboard: [[{ text: "Открыть игру", url: message.link?.url }]],
      },
    });
  });

  it("403 — blocked; 429 — ждать retry_after; 500 — ошибка без токена", async () => {
    expect(await senderReplying(403, {}).sender.send(message)).toEqual({
      ok: false,
      blocked: true,
    });
    expect(
      await senderReplying(400, {
        description: "Bad Request: chat not found",
      }).sender.send(message),
    ).toEqual({ ok: false, blocked: true });
    expect(
      await senderReplying(429, {
        parameters: { retry_after: 7 },
      }).sender.send(message),
    ).toEqual({ ok: false, error: "http_429", retryAfterMs: 7000 });
    const failed = await senderReplying(500, {}).sender.send(message);
    expect(failed).toEqual({ ok: false, error: "http_500" });
    expect(JSON.stringify(failed)).not.toContain(TOKEN);
  });
});
