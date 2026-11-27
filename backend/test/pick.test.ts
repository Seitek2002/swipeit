import type { PickAnswer, PickRequest } from "@swipeit/core/api/pick/types";
import { decodePickAnswer, encodePickAnswer } from "@swipeit/core/share-codec";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { pickAnswers } from "../src/db/schema";
import { createTestDb, resetDb } from "./db";
import { createTestServer, type TestUser } from "./server";

// «Выбери подарок сам» между телефонами (BACKEND.md B09): короткие ссылки,
// ответ хранится, запрос в ответе — только автору.
const database = createTestDb();
afterAll(() => database.close());

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeEach(async () => {
  await resetDb(database);
  server = await createTestServer(database);
});
afterEach(() => server.close());

const FILTERS = {
  budget: { min: 0, max: null },
  categories: [],
  marketplaces: [],
};

const swipe = (user: TestUser, requestId: string, productId: string) =>
  server.request(user, "POST", "/swipes", {
    productId,
    decision: "like",
    context: { kind: "pick", requestId },
  });

type Link = { code: string; url: string };
type AnswerView = {
  answer: PickAnswer;
  kind: string;
  request: null | PickRequest;
};

describe("ссылка-фильтр и ответ короткими ссылками", () => {
  it("ответ открывается по коду с другим токеном; запрос в нём — только автору; повтор заменяет ответ", async () => {
    const sender = await server.newUser({ name: "Азамат" });
    const created = (
      await server.request(sender, "POST", "/pick-requests", {
        filters: FILTERS,
        hidePrices: false,
        occasion: { kind: "march_8" },
      })
    ).json() as Link & { request: PickRequest };
    expect(created.code).toMatch(/^[A-Za-z0-9]{10}$/);
    expect(created.url).toBe(`http://localhost:4100/s/${created.code}`);

    // Друг открывает ссылку-фильтр на своём телефоне.
    const friend = await server.newUser({
      name: "Айгерим",
      audience: "female",
    });
    const opened = (
      await server.request(friend, "GET", `/share/${created.code}`)
    ).json() as { kind: string; request: PickRequest };
    expect(opened).toEqual({ kind: "pick_request", request: created.request });
    expect(opened.request.occasion).toEqual({
      kind: "march_8",
      date: "2027-03-08",
    });

    await swipe(friend, created.request.id, "p_0008");
    const answerPath = `/pick-requests/${created.request.id}/answer`;
    const answered = (
      await server.request(friend, "POST", answerPath)
    ).json() as Link & { answer: PickAnswer };
    expect(answered.code).toMatch(/^[A-Za-z0-9]{10}$/);

    // Отправитель открывает ответ — с запросом (повод, скрытие цен).
    const forSender = (
      await server.request(sender, "GET", `/share/${answered.code}`)
    ).json() as AnswerView;
    expect(forSender.kind).toBe("pick_answer");
    expect(forSender.answer).toMatchObject({
      requestId: created.request.id,
      by: { name: "Айгерим", gender: "female", userId: friend.id },
      picks: [{ productId: "p_0008", priority: "normal" }],
    });
    expect(forSender.request?.id).toBe(created.request.id);

    // Чужой по той же ссылке видит выбор, но не запрос.
    const stranger = await server.newUser({ name: "Чужой" });
    const forStranger = (
      await server.request(stranger, "GET", `/share/${answered.code}`)
    ).json() as AnswerView;
    expect(forStranger.request).toBeNull();
    const anonymous = (
      await server.request(null, "GET", `/share/${answered.code}`)
    ).json() as AnswerView;
    expect(anonymous.request).toBeNull();

    // Друг передумал и ответил снова — та же ссылка, новый выбор.
    await swipe(friend, created.request.id, "p_0023");
    const again = (
      await server.request(friend, "POST", answerPath)
    ).json() as Link;
    expect(again.code).toBe(answered.code);
    const updated = (
      await server.request(sender, "GET", `/share/${answered.code}`)
    ).json() as AnswerView;
    expect(updated.answer.picks.map((pick) => pick.productId)).toEqual([
      "p_0008",
      "p_0023",
    ]);
    expect(await database.db.select().from(pickAnswers)).toHaveLength(1);
  });

  it("старая ссылка-фильтр: запроса нет на сервере — ответ длинной ссылкой, без записи", async () => {
    const friend = await server.newUser({ name: "Айгерим" });
    await swipe(friend, "pk_old_link", "p_0008");
    const answered = (
      await server.request(friend, "POST", "/pick-requests/pk_old_link/answer")
    ).json() as { answer: PickAnswer; code?: string; url: string };
    expect(answered.code).toBeUndefined();
    const prefix = "/pick/answer/?d=";
    expect(answered.url.startsWith(prefix)).toBe(true);
    expect(decodePickAnswer(answered.url.slice(prefix.length))).toMatchObject({
      requestId: "pk_old_link",
    });
    expect(await database.db.select().from(pickAnswers)).toEqual([]);
  });

  it("старая ссылка-ответ разбирается; запрос — только автору", async () => {
    const sender = await server.newUser({ name: "Азамат" });
    const { request } = (
      await server.request(sender, "POST", "/pick-requests", {
        filters: FILTERS,
        hidePrices: true,
      })
    ).json() as { request: PickRequest };
    const encoded = encodePickAnswer({
      requestId: request.id,
      by: { name: "Айгерим", avatarColor: "mint" },
      picks: [{ productId: "p_0008", priority: "normal" }],
    });
    const own = (
      await server.request(sender, "POST", "/pick-answers", { encoded })
    ).json() as { answer: PickAnswer; request: null | PickRequest };
    expect(own.answer.picks).toHaveLength(1);
    expect(own.request?.hidePrices).toBe(true);
    const other = await server.newUser({ name: "Чужой" });
    const foreign = (
      await server.request(other, "POST", "/pick-answers", { encoded })
    ).json() as { request: null | PickRequest };
    expect(foreign.request).toBeNull();
  });
});
