import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeEach, describe, expect, it } from "vitest";

import { users } from "../src/db/schema";
import {
  parseTeamArgs,
  runTeamCommand,
  TEAM_HELP,
} from "../src/domains/funnel/team";
import { testCatalog } from "./contract/client";
import { createTestDb, resetDb } from "./db";
import { createTestServer, makeClock, type TestUser } from "./server";

// Пометка своих профилей (auto-tasks-metrics-1 M08): funnel:team.
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

const team = (...args: string[]) =>
  runTeamCommand(database.db, args, clock.now());

const isInternal = async (user: TestUser) => {
  const [row] = await database.db
    .select({ internal: users.funnelInternal })
    .from(users)
    .where(eq(users.id, user.id));
  return row?.internal;
};

// Профиль с отправленным вишлистом — код его короткой ссылки.
const withWishlistCode = async (name: string) => {
  const { products } = await testCatalog();
  const user = await server.newUser({ name });
  for (const product of products.slice(0, 5)) {
    await server.request(user, "POST", "/swipes", {
      productId: product.id,
      decision: "like",
      context: { kind: "self" },
    });
  }
  const { code } = (
    await server.request(user, "POST", "/wishlist/share")
  ).json() as { code: string };
  return { user, code };
};

// Игра с не своими участниками и код приглашения в неё.
const gameWithInvite = async (owner: TestUser) => {
  const created = (
    await server.request(owner, "POST", "/santa", {
      title: "Секретный офис",
      budget: 2000,
      exchangeDate: "2026-12-25",
      participantIds: [],
    })
  ).json() as { game: { id: string } };
  const member = await server.newUser({ name: "Азамат" });
  await server.request(member, "POST", `/santa/${created.game.id}/join`);
  const { code } = (
    await server.request(owner, "POST", "/share-links", {
      kind: "santa",
      targetId: created.game.id,
    })
  ).json() as { code: string };
  return { gameId: created.game.id, code, member };
};

describe("разбор аргументов", () => {
  it("--help, неизвестный флаг, --pick вне списка, без аргументов", () => {
    expect(parseTeamArgs(["--help"])).toEqual({
      ok: true,
      command: { kind: "help" },
    });
    expect(parseTeamArgs(["--hepl"])).toMatchObject({ ok: false });
    expect(parseTeamArgs(["--pick", "11"])).toMatchObject({ ok: false });
    expect(parseTeamArgs(["--pick", "15", "--recent", "20"])).toMatchObject({
      ok: true,
      command: { target: { kind: "pick", position: 15, limit: 20 } },
    });
    expect(parseTeamArgs([])).toMatchObject({ ok: false });
    expect(parseTeamArgs(["ABC123", "--undo"])).toMatchObject({
      ok: true,
      command: {
        target: { kind: "code", code: "ABC123" },
        flags: { undo: true },
      },
    });
  });

  it("справка: что делает, примеры и предупреждение про живую игру", async () => {
    const result = await team("--help");
    expect(result.exitCode).toBe(0);
    expect(result.text).toBe(TEAM_HELP);
    expect(result.text).toContain("--recent");
    expect(result.text).toContain(
      "Не помечай профиль, которым ведёшь живую игру",
    );
  });
});

describe("funnel:team (M08)", () => {
  it("код ссылки на вишлист → помечен; в выводе время, откуда и шаги, без id и имени", async () => {
    const { user, code } = await withWishlistCode("Айгерим");
    const result = await team(code);
    expect(result.exitCode).toBe(0);
    expect(await isInternal(user)).toBe(true);
    expect(result.text).toContain("Профиль помечен своим");
    // NOW — 28.11 12:00 по Бишкеку.
    expect(result.text).toMatch(
      /создан 28\.11 12:00, откуда: не указано, шагов засчитано: \d+, ведёт живых игр: 0, планов: 0/,
    );
    for (const secret of [user.id, "Айгерим", code]) {
      expect(result.text).not.toContain(secret);
    }

    const undone = await team(code, "--undo");
    expect(undone.exitCode).toBe(0);
    expect(undone.text).toContain("Пометка снята");
    expect(await isInternal(user)).toBe(false);
  });

  it("код приглашения в игру без --invite-owner → выход 1, пометки нет", async () => {
    const owner = await server.newUser({ name: "Айгерим" });
    const { code } = await gameWithInvite(owner);
    const result = await team(code);
    expect(result.exitCode).toBe(1);
    expect(result.text).toContain("Это приглашение в игру или план");
    expect(result.text).toContain("--invite-owner");
    expect(await isInternal(owner)).toBe(false);
  });

  it("ведёт игру с не своими участниками → предупреждение и выход 1; с --force — помечен", async () => {
    const owner = await server.newUser({ name: "Айгерим" });
    const { code } = await gameWithInvite(owner);
    const refused = await team(code, "--invite-owner");
    expect(refused.exitCode).toBe(1);
    expect(refused.text).toContain("ведёт живых игр: 1");
    expect(refused.text).toContain("--force");
    expect(await isInternal(owner)).toBe(false);

    const forced = await team(code, "--invite-owner", "--force");
    expect(forced.exitCode).toBe(0);
    expect(await isInternal(owner)).toBe(true);
    expect(forced.text).not.toContain(owner.id);
    expect(forced.text).not.toContain("Секретный офис");
  });

  it("игра, где все остальные свои, — не мешает пометке", async () => {
    const owner = await server.newUser({ name: "Айгерим" });
    const { code, member } = await gameWithInvite(owner);
    await database.db
      .update(users)
      .set({ funnelInternal: true })
      .where(eq(users.id, member.id));
    const result = await team(code, "--invite-owner");
    expect(result.exitCode).toBe(0);
    expect(result.text).toContain("ведёт живых игр: 0");
  });

  it("--recent и --pick 1 помечают последний созданный профиль; без id и имён", async () => {
    const first = await server.newUser({ name: "Айгерим" });
    clock.advance(60_000);
    const second = await server.newUser({ name: "Азамат" });
    clock.advance(60_000);
    const phone = (
      await server.request(null, "POST", "/users", { via: "feed" })
    ).json() as { me: { id: string } };

    const recent = await team("--recent");
    expect(recent.exitCode).toBe(0);
    const lines = recent.text.split("\n");
    expect(lines[1]).toBe(
      "  1. создан 28.11 12:02, откуда: из ленты, шагов: 1, свой: нет",
    );
    expect(lines[2]).toContain("2. создан 28.11 12:01");
    expect(lines[3]).toContain("3. создан 28.11 12:00");
    for (const secret of [
      first.id,
      second.id,
      phone.me.id,
      "Айгерим",
      "Азамат",
    ]) {
      expect(recent.text).not.toContain(secret);
    }

    const picked = await team("--pick", "1");
    expect(picked.exitCode).toBe(0);
    expect(picked.text).toContain("создан 28.11 12:02, откуда: из ленты");
    expect(await isInternal({ id: phone.me.id, token: "" })).toBe(true);
    expect(await isInternal(first)).toBe(false);
    expect(await isInternal(second)).toBe(false);
    expect((await team("--recent", "1")).text).toContain("свой: да");
  });

  it("--list — одно число; неизвестный код — выход 1", async () => {
    const { code } = await withWishlistCode("Айгерим");
    expect((await team("--list")).text).toBe("Своими помечено профилей: 0");
    await team(code);
    expect((await team("--list")).text).toBe("Своими помечено профилей: 1");
    const missing = await team("NoSuchCode1");
    expect(missing).toEqual({ exitCode: 1, text: "Ссылка не найдена" });
  });
});
