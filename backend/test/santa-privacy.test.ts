import type { SantaSummary, SantaView } from "@swipeit/core/api/santa/types";
import { createSeededRandom } from "@swipeit/core/logic/random";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { testConfig } from "./config";
import { santaAssignments } from "../src/db/schema";
import { makeFriends } from "../src/domains/friends/handlers";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";

// Тайный Санта на сервере (BACKEND.md B11): приватность пар (§4.6, п. 2) в
// игре на 30 человек (сверка с santa_assignments в базе) и гонка вступлений.
// Гонка «Провести жеребьёвку» — в test/contract/santa.test.ts.
const database = createTestDb();
afterAll(() => database.close());

let app: ReturnType<typeof buildApp>;
beforeEach(async () => {
  await resetDb(database);
  app = buildApp({
    config: testConfig(),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => NOW },
    random: createSeededRandom("santa-privacy"),
  });
});
afterEach(() => app.close());

type Person = { id: string; token: string };

const send = (
  person: Person,
  method: "GET" | "PATCH" | "POST",
  url: string,
  body?: object,
) =>
  app.inject({
    method,
    url: `/v1${url}`,
    ...(body ? { payload: body } : {}),
    headers: { authorization: `Bearer ${person.token}` },
  });

const ok = async <T>(
  person: Person,
  method: "GET" | "PATCH" | "POST",
  url: string,
  body?: object,
) => {
  const response = await send(person, method, url, body);
  if (response.statusCode !== 200) {
    throw new Error(
      `${method} ${url}: ${response.statusCode} ${response.body}`,
    );
  }
  return response.json() as T;
};

const person = async (name: string): Promise<Person> => {
  const response = await app.inject({ method: "POST", url: "/v1/users" });
  const { me, token } = response.json() as {
    me: { id: string };
    token: string;
  };
  const created = { id: me.id, token };
  await ok(created, "PATCH", "/me", { name });
  return created;
};

// Игра, где все вступили: организатор и n − 1 друзей.
const fullGame = async (size: number) => {
  const owner = await person("Организатор");
  const friends: Person[] = [];
  for (let index = 1; index < size; index += 1) {
    const friend = await person(`Участник ${index}`);
    await database.db.transaction((tx) =>
      makeFriends(tx, owner.id, friend.id, "santa", { now: () => NOW }),
    );
    friends.push(friend);
  }
  const created = await ok<SantaView>(owner, "POST", "/santa", {
    title: "Офис",
    budget: 2000,
    exchangeDate: "2026-12-25",
    participantIds: friends.map((friend) => friend.id),
  });
  for (const friend of friends) {
    await ok(friend, "POST", `/santa/${created.game.id}/join`);
  }
  return { owner, everyone: [owner, ...friends], gameId: created.game.id };
};

// Ни одно поле ответа не называет пары и тех, кто вскрыл или купил.
const FORBIDDEN_KEYS = [
  "assignments",
  "openedIds",
  "boughtIds",
  "santaId",
  "wardId",
];
const expectNoPairs = (body: unknown) => {
  const text = JSON.stringify(body);
  for (const key of FORBIDDEN_KEYS) expect(text).not.toContain(`"${key}"`);
};

describe("Тайный Санта на сервере", () => {
  it("§4.6 п. 2: в игре на 30 человек каждый во всех ответах видит только своего подопечного", async () => {
    const { owner, everyone, gameId } = await fullGame(30);
    const drawn = await ok<SantaView>(owner, "POST", `/santa/${gameId}/draw`);
    expectNoPairs(drawn);

    const pairs = new Map(
      (
        await database.db
          .select()
          .from(santaAssignments)
          .where(eq(santaAssignments.gameId, gameId))
      ).map((row) => [row.santaId, row.wardId]),
    );
    expect(pairs.size).toBe(30);
    expect(new Set(pairs.values()).size).toBe(30);

    for (const member of everyone) {
      const own = pairs.get(member.id);
      // До вскрытия: конверт ready, в списке подопечного ещё нет.
      const before = await ok<SantaSummary[]>(member, "GET", "/santa");
      expectNoPairs(before);
      expect(before[0]?.me?.envelope).toBe("ready");
      expect(before[0]?.me?.ward).toBeNull();

      const responses: SantaView[] = [
        await ok(member, "GET", `/santa/${gameId}`),
        await ok(member, "POST", `/santa/${gameId}/open`),
        await ok(member, "POST", `/santa/${gameId}/open`),
        await ok(member, "POST", `/santa/${gameId}/bought`, { bought: true }),
        await ok(member, "POST", `/santa/${gameId}/bought`, { bought: false }),
        await ok(member, "POST", `/santa/${gameId}/join`),
      ];
      for (const view of responses) {
        expectNoPairs(view);
        expect(view.me?.ward?.id).toBe(own);
      }
      const after = await ok<SantaSummary[]>(member, "GET", "/santa");
      expectNoPairs(after);
      expect(after[0]?.me?.ward?.id).toBe(own);

      // Правка после жеребьёвки — ошибка без пар в тексте.
      const patch = await send(member, "PATCH", `/santa/${gameId}`, {
        title: "Другое",
      });
      expect(patch.statusCode).toBeGreaterThanOrEqual(400);
      expectNoPairs(patch.json());
    }

    // Чужой человек видит игру без своего «я» и без пар.
    const stranger = await person("Чужой");
    const outside = await ok<SantaView>(stranger, "GET", `/santa/${gameId}`);
    expectNoPairs(outside);
    expect(outside.me).toBeNull();
    expect(outside.role).toBe("guest");
    expect(outside.openedCount).toBe(30);
  }, 180_000);

  it("трое одновременно вступают в игру на 28 → двое вошли, третий CONFLICT (предел 30 под блокировкой)", async () => {
    const { gameId } = await fullGame(28);
    const late = await Promise.all(
      [1, 2, 3].map((index) => person(`Опоздавший ${index}`)),
    );
    const results = await Promise.all(
      late.map((member) => send(member, "POST", `/santa/${gameId}/join`)),
    );
    expect(results.map((r) => r.statusCode).sort()).toEqual([200, 200, 409]);
  }, 120_000);
});
