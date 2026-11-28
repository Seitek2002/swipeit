import { describe, expect, it } from "vitest";

import { normalizeBase } from "../src/rehearsal/client";
import { findPairLeaks } from "../src/rehearsal/privacy";

// Проверка приватности репетиции (auto-tasks-pm-4 S06, шаг 7) — без сервера
// и базы: «проверка проверки» на подложенных ответах.
const ME = "u_me";
const MY_WARD = "u_ward";
const OTHER_WARD = "u_other";

const view = (wardId: null | string) => ({
  game: { id: "sg_1", participantIds: [ME, MY_WARD, OTHER_WARD] },
  members: [{ id: ME }, { id: MY_WARD }, { id: OTHER_WARD }],
  me: {
    envelope: "opened",
    bought: false,
    ward: wardId ? { id: wardId, name: "Азамат", wishlist: [] } : null,
  },
});

const leaksOf = (
  responses: unknown[],
  events: unknown[] = [],
  ownWardIds: string[] = [MY_WARD],
) =>
  findPairLeaks({
    viewerId: ME,
    ownWardIds: new Set(ownWardIds),
    responses: responses.map((body) => ({ route: "/santa/:id", body })),
    events,
  });

describe("репетиция: поиск чужих пар (S06)", () => {
  it("свой подопечный и id участников в members — не утечка", () => {
    expect(leaksOf([view(MY_WARD), view(null)])).toEqual([]);
  });

  it("в чужом GET /santa/:id оказался ward — утечка, шаг 7 падает", () => {
    const leaks = leaksOf([view(OTHER_WARD)]);
    expect(leaks).toHaveLength(1);
    expect(leaks[0]).toMatchObject({ reason: "чужой подопечный" });
    expect(leaks[0]?.path).toBe("/santa/:id.me.ward");
  });

  it("assignments, santaId, wardId — утечка где угодно", () => {
    const reasons = leaksOf([
      { game: { assignments: { [ME]: MY_WARD } } },
      { list: [{ santaId: "u_x" }] },
      { wardId: OTHER_WARD },
    ]).map((leak) => leak.reason);
    expect(reasons).toEqual([
      "пары целиком",
      "чей-то Санта",
      "чужой подопечный",
    ]);
  });

  it("сокет: брони чужого подопечного и чужой тост — утечка; свои — нет", () => {
    const own = [
      { type: "db:changed", scope: ["reservations", "wishlist"], id: MY_WARD },
      { type: "db:changed", scope: ["reservations"], id: ME },
      { type: "db:changed", scope: ["santa"], id: "sg_1" },
      { type: "toast", text: "Организатор изменил условия", forUserId: ME },
    ];
    expect(leaksOf([], own)).toEqual([]);
    const reasons = leaksOf(
      [],
      [
        { type: "db:changed", scope: ["reservations"], id: OTHER_WARD },
        { type: "toast", text: "Твой подопечный вышел", forUserId: "u_x" },
      ],
    ).map((leak) => leak.reason);
    expect(reasons).toEqual([
      "брони чужого подопечного",
      "тост другому человеку",
    ]);
  });

  it("после «Убрать» у Санты два своих подопечных — оба не утечка", () => {
    expect(
      leaksOf([view(MY_WARD), view(OTHER_WARD)], [], [MY_WARD, OTHER_WARD]),
    ).toEqual([]);
  });

  it("адрес сервера — без хвостового / и /v1", () => {
    expect(normalizeBase("http://localhost:4100/")).toBe(
      "http://localhost:4100",
    );
    expect(normalizeBase("https://api.example/v1/")).toBe(
      "https://api.example",
    );
  });
});
