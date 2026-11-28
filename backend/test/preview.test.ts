import { createSeededRandom } from "@swipeit/core/logic/random";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { makeFriends } from "../src/domains/friends/handlers";
import { NOW, testCatalog } from "./contract/client";
import { testConfig } from "./config";
import { createTestDb, resetDb } from "./db";

// Превью коротких ссылок /s/:code (BACKEND.md §6.3, B16).
const database = createTestDb();
afterAll(() => database.close());

let app: ReturnType<typeof buildApp>;
beforeEach(async () => {
  await resetDb(database);
  app = buildApp({
    config: testConfig({ PUBLIC_APP_URL: "https://app.swipeit.example/" }),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => NOW },
    random: createSeededRandom("preview"),
  });
});
afterEach(() => app.close());

type Person = { id: string; token: string };

const call = (
  who: Person,
  method: "PATCH" | "POST",
  url: string,
  body?: object,
) =>
  app.inject({
    method,
    url: `/v1${url}`,
    headers: { authorization: `Bearer ${who.token}` },
    ...(body ? { payload: body } : {}),
  });

const person = async (patch: object): Promise<Person> => {
  const response = await app.inject({ method: "POST", url: "/v1/users" });
  const { me, token } = response.json() as {
    me: { id: string };
    token: string;
  };
  const created = { id: me.id, token };
  await call(created, "PATCH", "/me", patch);
  return created;
};

const preview = (code: string, agent: string) =>
  app.inject({
    method: "GET",
    url: `/s/${code}`,
    headers: { "user-agent": agent },
  });

describe("превью коротких ссылок (B16)", () => {
  it("вишлист: теги для Telegram и WhatsApp, имя экранировано, без сообщения, заметок и своего названия даты", async () => {
    const { products } = await testCatalog();
    const owner = await person({
      name: "<script>alert(1)</script>",
      birthday: "03-14",
    });
    const date = (
      await call(owner, "POST", "/me/dates", {
        date: "12-20",
        label: "Тайный повод",
      })
    ).json() as { id: string };
    for (const product of products.slice(0, 5)) {
      await call(owner, "POST", "/swipes", {
        productId: product.id,
        decision: "like",
        context: { kind: "self" },
      });
    }
    await call(owner, "PATCH", "/wishlist/meta", {
      occasion: { kind: "important", dateId: date.id },
      message: "Секретное сообщение",
    });
    const wish = (
      await call(owner, "POST", "/wishlist/items", { title: "Плед" })
    ).json() as { id: string };
    await call(owner, "PATCH", `/wishlist/items/${wish.id}`, {
      note: "Секретная заметка",
    });
    const { code } = (await call(owner, "POST", "/wishlist/share")).json() as {
      code: string;
    };

    for (const agent of ["TelegramBot (like TwitterBot)", "WhatsApp/2.24"]) {
      const response = await preview(code, agent);
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
      const html = response.body;
      expect(html).toContain('property="og:title"');
      expect(html).toContain("summary_large_image");
      expect(html).toContain("https://app.swipeit.example/og.png");
      expect(html).toContain(`https://app.swipeit.example/w/?s=${code}`);
      expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
      expect(html).not.toContain("<script>alert(1)");
      expect(html).toContain("6 желаний");
      for (const secret of [
        "Секретное сообщение",
        "Секретная заметка",
        "Тайный повод",
      ]) {
        expect(html).not.toContain(secret);
      }
    }
  });

  it("Санта и план — свои заголовки и переход; закрытая ссылка — «Ссылка больше не работает»", async () => {
    const owner = await person({ name: "Айгерим" });
    const friend = await person({ name: "Азамат" });
    await database.db.transaction((tx) =>
      makeFriends(tx, owner.id, friend.id, "plan", { now: () => NOW }),
    );
    const game = (
      await call(owner, "POST", "/santa", {
        title: "Офис",
        budget: 2000,
        exchangeDate: "2026-12-27",
        participantIds: [],
      })
    ).json() as { game: { id: string } };
    const santa = (
      await call(owner, "POST", "/share-links", {
        kind: "santa",
        targetId: game.game.id,
      })
    ).json() as { code: string };
    const santaHtml = (await preview(santa.code, "TelegramBot")).body;
    expect(santaHtml).toContain("Тайный Санта «Офис»");
    expect(santaHtml).toContain("обмен 27");
    expect(santaHtml).toContain(`/santa/join/?id=${game.game.id}`);

    const plan = (
      await call(owner, "POST", "/plans", {
        title: "Пятница вечером",
        mode: "live",
        participantIds: [friend.id],
        filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
      })
    ).json() as { plan: { id: string } };
    const planLink = (
      await call(owner, "POST", "/share-links", {
        kind: "plan",
        targetId: plan.plan.id,
      })
    ).json() as { code: string };
    expect((await preview(planLink.code, "WhatsApp")).body).toContain(
      "Айгерим зовёт: «Пятница вечером»",
    );

    const closed = (await preview("AAAAAAAAAA", "TelegramBot")).body;
    expect(closed).toContain("Ссылка больше не работает");
  });
});
