import type { FriendSummary } from "@swipeit/core/api/users/types";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { santaGames, santaMembers } from "../src/db/schema";
import { makeFriends } from "../src/domains/friends/handlers";
import { NOW } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer } from "./server";

// Обязательные тесты приватности (BACKEND.md §4.6). B05 — пункты 3–5;
// остальные добавят B07–B12.
const database = createTestDb();
afterAll(() => database.close());

let server: Awaited<ReturnType<typeof createTestServer>>;
beforeEach(async () => {
  await resetDb(database);
  server = await createTestServer(database);
});
afterEach(() => server.close());

const clock = { now: () => NOW };
const befriend = (a: string, b: string) =>
  database.db.transaction((tx) => makeFriends(tx, a, b, "plan", clock));

// Личное у человека: день рождения, своя дата, скрытое напоминание, «Не моё»,
// подсказка.
const withSecrets = async () => {
  const owner = await server.newUser({
    name: "Айпери",
    birthday: "12-10",
    mutedInterests: ["gadgets"],
  });
  await server.request(owner, "POST", "/me/dates", {
    date: "12-01",
    label: "Секрет",
  });
  await server.request(owner, "POST", "/me/hints", { id: "deck_guide" });
  await server.request(
    owner,
    "POST",
    `/me/reminders/${encodeURIComponent("birthday:2026")}/dismiss`,
  );
  return owner;
};

const PRIVATE_FIELDS = [
  "taste",
  "mutedInterests",
  "seenHints",
  "dismissedReminders",
  "interests",
  "audience",
];

describe("§4.6 п. 3 — значимые даты и напоминания только владельцу", () => {
  it("друг не видит чужие даты и напоминания ни одним маршрутом", async () => {
    const owner = await withSecrets();
    const friend = await server.newUser({ name: "Бакыт" });
    await befriend(owner.id, friend.id);
    const own = await server.request(owner, "GET", "/me/dates");
    expect(own.json()).toHaveLength(1);
    expect((await server.request(friend, "GET", "/me/dates")).json()).toEqual(
      [],
    );
    expect(
      (await server.request(friend, "GET", "/me/reminders")).json(),
    ).toEqual([]);
    const seen = await server.request(friend, "GET", `/users/${owner.id}`);
    expect(seen.body).not.toContain("Секрет");
    expect(seen.body).not.toContain("12-01");
  });
});

describe("§4.6 п. 4 — вкус, «Не моё», подсказки, скрытые напоминания только себе", () => {
  it("другу и в списке друзей — только имя, фон и день рождения", async () => {
    const owner = await withSecrets();
    const friend = await server.newUser({ name: "Бакыт" });
    await befriend(owner.id, friend.id);

    const seen = (
      await server.request(friend, "GET", `/users/${owner.id}`)
    ).json();
    expect(seen).toEqual({
      id: owner.id,
      name: "Айпери",
      avatarColor: expect.any(String),
      birthday: "12-10",
    });
    const [summary] = (
      await server.request(friend, "GET", "/friends")
    ).json() as FriendSummary[];
    expect(summary).toEqual({ user: seen, daysToBirthday: 12 });
    for (const field of PRIVATE_FIELDS) {
      expect(seen).not.toHaveProperty(field);
      expect(summary?.user).not.toHaveProperty(field);
    }

    const self = (
      await server.request(owner, "GET", `/users/${owner.id}`)
    ).json();
    expect(self).toMatchObject({
      dismissedReminders: ["birthday:2026"],
      mutedInterests: ["gadgets"],
      seenHints: ["deck_guide"],
    });
  });
});

describe("§4.6 п. 5 — чужой профиль по id только друзьям", () => {
  it("незнакомцу — 404, как несуществующий; другу — с днём рождения", async () => {
    const owner = await withSecrets();
    const stranger = await server.newUser({ name: "Чужой" });
    const response = await server.request(
      stranger,
      "GET",
      `/users/${owner.id}`,
    );
    expect(response.statusCode).toBe(404);
    const missing = await server.request(stranger, "GET", "/users/u_nope");
    expect(missing.statusCode).toBe(404);
    expect(response.json().message).toBe(missing.json().message);
    expect(response.body).not.toContain("Айпери");

    await befriend(owner.id, stranger.id);
    const friend = await server.request(stranger, "GET", `/users/${owner.id}`);
    expect(friend.statusCode).toBe(200);
    expect(friend.json()).toMatchObject({ birthday: "12-10" });
  });

  it("соучастнику Санты — без дня рождения; без входа — 401", async () => {
    const owner = await withSecrets();
    const colleague = await server.newUser({ name: "Коллега" });
    await database.db.insert(santaGames).values({
      id: "sg_test",
      title: "Офис",
      ownerId: owner.id,
      budget: 1000,
      exchangeDate: "2026-12-25",
    });
    await database.db.insert(santaMembers).values([
      { gameId: "sg_test", userId: owner.id, state: "joined" },
      { gameId: "sg_test", userId: colleague.id, state: "joined" },
    ]);
    const seen = await server.request(colleague, "GET", `/users/${owner.id}`);
    expect(seen.json()).toEqual({
      id: owner.id,
      name: "Айпери",
      avatarColor: expect.any(String),
    });
    // Соучастник — не друг: в списке друзей его нет.
    expect((await server.request(colleague, "GET", "/friends")).json()).toEqual(
      [],
    );
    const anonymous = await server.request(null, "GET", `/users/${owner.id}`);
    expect(anonymous.statusCode).toBe(401);
  });
});

describe("друзья (§4.3)", () => {
  it("дружба в обе стороны, повтор не дублирует; безымянных в списке нет; ближайшие дни рождения сверху", async () => {
    const me = await server.newUser({ name: "Я" });
    const late = await server.newUser({ name: "Бакыт", birthday: "05-01" });
    const soon = await server.newUser({ name: "Айгуль", birthday: "12-01" });
    const noDate = await server.newUser({ name: "Азамат" });
    const nameless = await server.newUser();
    for (const friend of [late, soon, noDate, nameless]) {
      await befriend(me.id, friend.id);
    }
    expect(await befriend(soon.id, me.id)).toBe(false);
    const list = (
      await server.request(me, "GET", "/friends")
    ).json() as FriendSummary[];
    expect(list.map((entry) => entry.user.name)).toEqual([
      "Айгуль",
      "Бакыт",
      "Азамат",
    ]);
    expect(list[0]?.daysToBirthday).toBe(3);
    const back = (
      await server.request(soon, "GET", "/friends")
    ).json() as FriendSummary[];
    expect(back.map((entry) => entry.user.id)).toEqual([me.id]);
  });
});
