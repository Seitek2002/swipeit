import type { PlanView } from "@swipeit/core/api/plans/types";
import { createSeededRandom } from "@swipeit/core/logic/random";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { buildApp } from "../src/app";
import { loadConfig } from "../src/config";
import { makeFriends } from "../src/domains/friends/handlers";
import { createRecordingHub } from "../src/realtime/hub";
import { NOW, testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";

// Гонка свайпов плана (BACKEND.md B10): 15 участников свайпают одновременно,
// и по каждому совпадению уходит ровно одно plan:match — свайпы идут по
// очереди под блокировкой строки плана.
const database = createTestDb();
afterAll(() => database.close());

let app: ReturnType<typeof buildApp>;
let hub: ReturnType<typeof createRecordingHub>;
beforeEach(async () => {
  await resetDb(database);
  hub = createRecordingHub();
  app = buildApp({
    config: loadConfig({ LOG_LEVEL: "silent" }),
    db: database,
    catalog: await testCatalog(),
    clock: { now: () => NOW },
    random: createSeededRandom("plans-race"),
    hub,
  });
});
afterEach(() => app.close());

type Person = { id: string; token: string };

const request = async <T>(
  person: Person,
  method: "GET" | "POST",
  url: string,
  body?: object,
) => {
  const response = await app.inject({
    method,
    url: `/v1${url}`,
    ...(body ? { payload: body } : {}),
    headers: { authorization: `Bearer ${person.token}` },
  });
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
  await app.inject({
    method: "PATCH",
    url: "/v1/me",
    payload: { name },
    headers: { authorization: `Bearer ${token}` },
  });
  return created;
};

describe("план: одновременные свайпы", () => {
  it("15 участников лайкают колоду одновременно → по каждому совпадению одно plan:match", async () => {
    const { activities } = await testCatalog();
    const category = activities[0]?.category ?? "chill";
    const owner = await person("Организатор");
    const friends: Person[] = [];
    for (let index = 0; index < 14; index += 1) {
      const friend = await person(`Друг ${index + 1}`);
      await database.db.transaction((tx) =>
        makeFriends(tx, owner.id, friend.id, "plan", { now: () => NOW }),
      );
      friends.push(friend);
    }
    const created = await request<PlanView>(owner, "POST", "/plans", {
      title: "Гонка",
      mode: "live",
      participantIds: friends.map((friend) => friend.id),
      filters: {
        categories: [category],
        budgetPerPerson: { min: 0, max: null },
      },
    });
    const planId = created.plan.id;
    await Promise.all(
      friends.map((friend) =>
        request(friend, "POST", `/plans/${planId}/ready`, { ready: true }),
      ),
    );
    const started = await request<PlanView>(
      owner,
      "POST",
      `/plans/${planId}/start`,
    );
    const deck = started.activities.map((activity) => activity.id);
    expect(deck.length).toBeGreaterThan(1);

    // Каждый лайкает всю колоду по порядку; все 15 — одновременно.
    const everyone = [owner, ...friends];
    await Promise.all(
      everyone.map(async (member) => {
        for (const activityId of deck) {
          await request(member, "POST", `/plans/${planId}/swipes`, {
            activityId,
            decision: "like",
          });
        }
      }),
    );

    const matches = hub.delivered.filter(
      (event) => event.type === "plan:match",
    );
    expect(matches.map((event) => event.activityId).sort()).toEqual(
      [...deck].sort(),
    );
    const final = await request<PlanView>(owner, "GET", `/plans/${planId}`);
    expect(final.plan.status).toBe("results");
    expect(final.plan.finishedIds.sort()).toEqual(
      everyone.map((member) => member.id).sort(),
    );
    for (const member of everyone) {
      expect(Object.keys(final.plan.swipes[member.id] ?? {})).toHaveLength(
        deck.length,
      );
    }
  }, 120_000);

  it("не участник видит превью без свайпов и голосов", async () => {
    const { activities } = await testCatalog();
    const owner = await person("Организатор");
    const stranger = await person("Чужой");
    const created = await request<PlanView>(owner, "POST", "/plans", {
      title: "Кино",
      mode: "deadline",
      deadline: new Date(NOW + 3600_000).toISOString(),
      participantIds: [],
      filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
    });
    const first = created.activities[0]?.id ?? activities[0]?.id ?? "";
    await request(owner, "POST", `/plans/${created.plan.id}/swipes`, {
      activityId: first,
      decision: "like",
    });
    const preview = await request<PlanView>(
      stranger,
      "GET",
      `/plans/${created.plan.id}`,
    );
    expect(preview.plan.swipes).toEqual({});
    expect(preview.plan.votes).toEqual({});
    expect(preview.plan.title).toBe("Кино");
    expect(preview.participants.map((p) => p.name)).toEqual(["Организатор"]);
    const own = await request<PlanView>(
      owner,
      "GET",
      `/plans/${created.plan.id}`,
    );
    expect(own.plan.swipes[owner.id]).toEqual({ [first]: "like" });
  });
});
