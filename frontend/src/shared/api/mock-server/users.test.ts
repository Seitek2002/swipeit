import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import { AVATAR_COLORS } from "@/shared/config";

import type { FriendSummary, MeResponse, User } from "../users/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
  createRecordingRealtime,
} from "./adapters/memory";
import { parseActivities, parseProducts } from "./catalog-parse";
import { parseDb } from "./db";
import { createSeededRandom } from "./random";
import { DEMO_USER_ID, createSeedDb } from "./seed";
import { type MockServer, createMockServer } from "./server";

// Этап 7, T22 (сервер): вход без анкеты, имя по требованию, подсказки.
// Профиль создаётся без полей, а сервер сам не пускает безымянного туда,
// где его увидят другие (NAME_REQUIRED).
const readStub = (file: string): unknown =>
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL(`../../../../catalog-stub/${file}`, import.meta.url),
      ),
      "utf8",
    ),
  );
const { items: products } = parseProducts(readStub("products.json"));
const { items: activities } = parseActivities(readStub("activities.json"));

const NOW = new Date(2026, 10, 27, 12).getTime();

let server: MockServer;
let realtime: ReturnType<typeof createRecordingRealtime>;
let mode: "lan" | "local" = "local";

const call = <T>(
  method: "DELETE" | "GET" | "PATCH" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
  query?: Record<string, unknown>,
) => server.handle({ method, path, userId, body, query }) as Promise<T>;

const createServer = () => {
  const clock = createFixedClock(NOW);
  realtime = createRecordingRealtime();
  server = createMockServer({
    catalog: createMemoryCatalog(products, activities),
    clock,
    db: createMemoryDb(async () =>
      createSeedDb({ products, now: clock.now() }),
    ),
    mode,
    realtime,
    random: createSeededRandom("users-test"),
    settings: createMemorySettings(),
  });
};

beforeEach(() => {
  mode = "local";
  createServer();
});

const nameless = () => call<MeResponse>("POST", "/users", null);

const likeFive = async (userId: string) => {
  for (const product of products.slice(0, 5)) {
    await call("POST", "/swipes", userId, {
      productId: product.id,
      decision: "like",
      context: { kind: "self" },
    });
  }
};

describe("POST /users без анкеты", () => {
  it("без тела — профиль без имени, интересов и даты, «всем», с демо-друзьями", async () => {
    const user = await nameless();
    expect(user.id).toMatch(/^u_/);
    expect(user.name).toBeUndefined();
    expect(user.birthday).toBeUndefined();
    expect(user.interests).toEqual([]);
    expect(user.audience).toBe("all");
    expect(user.isBot).toBe(false);
    expect(AVATAR_COLORS).toContain(user.avatarColor);
    const friends = await call<FriendSummary[]>("GET", "/friends", user.id);
    expect(friends).toHaveLength(8);
    expect(realtime.events).toContainEqual({
      type: "db:changed",
      scope: ["users"],
      id: user.id,
      by: user.id,
    });
  });

  it("фон аватара — через ctx.random: при том же сиде тот же, а у разных профилей бывают разные", async () => {
    const colors = new Set<string>();
    for (let i = 0; i < 12; i += 1) colors.add((await nameless()).avatarColor);
    expect(colors.size).toBeGreaterThan(1);
    createServer();
    const first = await nameless();
    createServer();
    expect((await nameless()).avatarColor).toBe(first.avatarColor);
  });

  it("пустое тело {} — то же, что без тела; пустое имя — VALIDATION", async () => {
    const user = await call<User>("POST", "/users", null, {});
    expect(user.name).toBeUndefined();
    await expect(
      call("POST", "/users", null, { name: "  " }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("PATCH /me — имя и фон аватара в любой момент", () => {
  it("имя и цвет меняются, имя обрезается по краям", async () => {
    const user = await nameless();
    const named = await call<MeResponse>("PATCH", "/me", user.id, {
      name: "  Айпери ",
      avatarColor: "olive",
    });
    expect(named).toMatchObject({ name: "Айпери", avatarColor: "olive" });
    const renamed = await call<MeResponse>("PATCH", "/me", user.id, {
      name: "Айпери Т.",
    });
    expect(renamed).toMatchObject({ name: "Айпери Т.", avatarColor: "olive" });
    expect((await call<MeResponse>("GET", "/me", user.id)).name).toBe(
      "Айпери Т.",
    );
  });

  it("чужой цвет и имя длиннее 40 — VALIDATION", async () => {
    const user = await nameless();
    await expect(
      call("PATCH", "/me", user.id, { avatarColor: "blue" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      call("PATCH", "/me", user.id, { name: "А".repeat(41) }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("подсказки", () => {
  it("POST /me/hints отмечает подсказку один раз, /demo/hints/reset снимает", async () => {
    const user = await nameless();
    expect(user.seenHints).toBeUndefined();
    const once = await call<MeResponse>("POST", "/me/hints", user.id, {
      id: "deck_guide",
    });
    expect(once.seenHints).toEqual(["deck_guide"]);
    await call("POST", "/me/hints", user.id, { id: "deck_guide" });
    const both = await call<MeResponse>("POST", "/me/hints", user.id, {
      id: "taste_toast",
    });
    expect(both.seenHints).toEqual(["deck_guide", "taste_toast"]);

    const reset = await call<MeResponse>("POST", "/demo/hints/reset", user.id);
    expect(reset.seenHints ?? []).toEqual([]);
    expect(
      (await call<MeResponse>("GET", "/me", user.id)).seenHints ?? [],
    ).toEqual([]);
  });

  it("неизвестная подсказка — VALIDATION, без сессии — FORBIDDEN", async () => {
    const user = await nameless();
    await expect(
      call("POST", "/me/hints", user.id, { id: "nope" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      call("POST", "/me/hints", null, { id: "deck_guide" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(call("POST", "/demo/hints/reset", null)).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
  });
});

describe("NAME_REQUIRED — где имя увидят другие", () => {
  const PLAN = {
    title: "Пятница",
    mode: "live",
    participantIds: [],
    matchRule: "all",
    filters: { categories: [], budgetPerPerson: { min: 0, max: null } },
    customActivityIds: [],
  };
  const GAME = {
    title: "Офис",
    budget: 2000,
    exchangeDate: "2026-12-28",
    participantIds: [],
  };

  const expectNameRequired = (promise: Promise<unknown>) =>
    expect(promise).rejects.toMatchObject({
      code: "NAME_REQUIRED",
      status: 409,
    });

  it("отправка вишлиста: до 5 «Хочу» — FORBIDDEN, потом NAME_REQUIRED, с именем — ссылка", async () => {
    const user = await nameless();
    await expect(
      call("POST", "/wishlist/share", user.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await likeFive(user.id);
    await expectNameRequired(call("POST", "/wishlist/share", user.id));
    await call("PATCH", "/me", user.id, { name: "Айпери" });
    const { url } = await call<{ url: string }>(
      "POST",
      "/wishlist/share",
      user.id,
    );
    expect(url).toMatch(/^\/w\/\?d=/);
  });

  it("ссылка-фильтр и ответ на неё", async () => {
    const user = await nameless();
    await expectNameRequired(
      call("POST", "/pick-requests", user.id, {
        filters: {
          budget: { min: 0, max: null },
          categories: [],
          marketplaces: [],
        },
        hidePrices: false,
      }),
    );
    await call("POST", "/swipes", user.id, {
      productId: products[0]?.id,
      decision: "like",
      context: { kind: "pick", requestId: "pk_x" },
    });
    await expectNameRequired(
      call("POST", "/pick-requests/pk_x/answer", user.id),
    );
  });

  it("план: создание и вступление", async () => {
    const user = await nameless();
    await expectNameRequired(call("POST", "/plans", user.id, PLAN));
    const { plan } = await call<{ plan: { id: string } }>(
      "POST",
      "/plans",
      DEMO_USER_ID,
      PLAN,
    );
    await expectNameRequired(call("POST", `/plans/${plan.id}/join`, user.id));
    // Битая ссылка — NOT_FOUND, а не вопрос имени.
    await expect(
      call("POST", "/plans/pl_nope/join", user.id),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await call("PATCH", "/me", user.id, { name: "Айпери" });
    await expect(
      call("POST", `/plans/${plan.id}/join`, user.id),
    ).resolves.toBeTruthy();
  });

  it("Санта: создание и вступление", async () => {
    const user = await nameless();
    await expectNameRequired(call("POST", "/santa", user.id, GAME));
    const { game } = await call<{ game: { id: string } }>(
      "POST",
      "/santa",
      DEMO_USER_ID,
      GAME,
    );
    await expectNameRequired(call("POST", `/santa/${game.id}/join`, user.id));
    await call("PATCH", "/me", user.id, { name: "Айпери" });
    await expect(
      call("POST", `/santa/${game.id}/join`, user.id),
    ).resolves.toBeTruthy();
  });

  it("безымянного нельзя позвать в план или игру — его нет среди друзей", async () => {
    mode = "lan";
    createServer();
    const user = await nameless();
    await expect(
      call("POST", "/plans", DEMO_USER_ID, {
        ...PLAN,
        participantIds: [user.id],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      call("POST", "/santa", DEMO_USER_ID, {
        ...GAME,
        participantIds: [user.id],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("бронь от профиля без имени — NAME_REQUIRED; с именем — под именем профиля; гость — как раньше", async () => {
    const ownerId = (await call<User>("POST", "/auth/demo", null)).id;
    const wishlist = await call<{
      items: Array<{ source: { kind: string; productId?: string } }>;
    }>("GET", "/wishlist", ownerId);
    const keys = wishlist.items
      .map((item) => item.source.productId)
      .filter((id): id is string => Boolean(id));

    const user = await nameless();
    await expectNameRequired(
      call("POST", "/reservations", user.id, {
        ownerId,
        itemKey: keys[0],
        name: "Подставное",
      }),
    );
    await call("PATCH", "/me", user.id, { name: "Айпери" });
    const mine = await call<{ reserver: { name: string; userId: string } }>(
      "POST",
      "/reservations",
      user.id,
      { ownerId, itemKey: keys[0], name: "Подставное" },
    );
    expect(mine.reserver).toEqual({ userId: user.id, name: "Айпери" });

    // Гость без профиля называется только для брони.
    const guest = await call<{ reserver: { name: string } }>(
      "POST",
      "/reservations",
      null,
      { ownerId, itemKey: keys[1], name: "Бакыт", guestId: "g_1" },
    );
    expect(guest.reserver.name).toBe("Бакыт");
    await expect(
      call("POST", "/reservations", null, {
        ownerId,
        itemKey: keys[2],
        guestId: "g_2",
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("друзья и профили без имени", () => {
  it("в lan безымянного нет в друзьях и в /demo/users у других, после имени — есть", async () => {
    mode = "lan";
    createServer();
    const other = await call<User>("POST", "/users", null, { name: "Бакыт" });
    const user = await nameless();
    const friendIds = async () =>
      (await call<FriendSummary[]>("GET", "/friends", other.id)).map(
        (friend) => friend.user.id,
      );
    const demoIds = async (as: string) =>
      (await call<User[]>("GET", "/demo/users", as)).map((u) => u.id);
    expect(await friendIds()).not.toContain(user.id);
    expect(await demoIds(other.id)).not.toContain(user.id);
    expect(await demoIds(user.id)).toContain(user.id);

    await call("PATCH", "/me", user.id, { name: "Айпери" });
    expect(await friendIds()).toContain(user.id);
    expect(await demoIds(other.id)).toContain(user.id);
  });

  it("в local «Смотреть как» видит и безымянные профили", async () => {
    const user = await nameless();
    const ids = (await call<User[]>("GET", "/demo/users", null)).map(
      (u) => u.id,
    );
    expect(ids).toContain(user.id);
  });
});

describe("совместимость со старой базой", () => {
  // База до этапа 7: профиль из старого онбординга с именем, днём рождения,
  // интересами и аудиторией, без seenHints/taste/importantDates. Снимок
  // заморожен — он не должен зависеть от того, как сид выглядит сейчас.
  const OLD_DB = {
    version: 1,
    users: {
      u_old: {
        id: "u_old",
        name: "Старый профиль",
        avatarColor: "rose",
        birthday: "03-14",
        interests: ["coffee", "music"],
        audience: "female",
        isBot: false,
        createdAt: "2026-11-20T10:00:00.000Z",
      },
      u_azamat: {
        id: "u_azamat",
        name: "Азамат",
        avatarColor: "mint",
        birthday: "07-22",
        interests: ["gadgets"],
        audience: "male",
        isBot: true,
        bot: {
          likesCategories: ["tech"],
          likeProbability: 0.4,
          speedFactor: 0.8,
        },
        createdAt: "2026-10-28T10:00:00.000Z",
      },
    },
    friends: { u_old: ["u_azamat"], u_azamat: ["u_old"] },
    productSwipes: [
      {
        id: "sw_1",
        userId: "u_old",
        productId: "p_0001",
        decision: "like",
        context: { kind: "self" },
        at: "2026-11-20T10:05:00.000Z",
      },
    ],
    wishlistItems: {
      u_old: [
        {
          id: "wi_1",
          ownerId: "u_old",
          source: { kind: "product", productId: "p_0001" },
          priority: "normal",
          order: 0,
          status: "active",
          addedAt: "2026-11-20T10:05:00.000Z",
        },
      ],
    },
    wishlistMeta: {
      u_old: {
        ownerId: "u_old",
        occasion: {
          kind: "custom",
          label: "Защита диплома",
          date: "2027-06-02",
        },
        hideReservationCount: false,
      },
    },
    reservations: [],
    externalWishlists: {},
    pickRequests: {},
    pickAnswers: [],
    customActivities: {},
    plans: {},
    santaGames: {},
  };

  it("читается без сброса: профиль, вишлист и повод на месте", () => {
    const db = parseDb(JSON.stringify(OLD_DB));
    expect(db).not.toBe("broken");
    expect(db).not.toBeNull();
    if (!db || db === "broken") return;
    expect(db.version).toBe(1);
    expect(db.users.u_old).toMatchObject({
      name: "Старый профиль",
      birthday: "03-14",
      interests: ["coffee", "music"],
    });
    expect(db.wishlistItems.u_old).toHaveLength(1);
    // Значимых дат в старой базе нет — пустой список, а не сброс.
    expect(db.importantDates).toEqual({});
    expect(db.wishlistMeta.u_old?.occasion).toMatchObject({
      kind: "custom",
      label: "Защита диплома",
    });
  });

  it("со старым профилем работают новые маршруты", async () => {
    const parsed = parseDb(JSON.stringify(OLD_DB));
    if (!parsed || parsed === "broken") throw new Error("база не прочиталась");
    server = createMockServer({
      catalog: createMemoryCatalog(products, activities),
      clock: createFixedClock(NOW),
      db: createMemoryDb(async () => parsed),
      realtime: createRecordingRealtime(),
      random: createSeededRandom("old-db"),
      settings: createMemorySettings(),
    });
    const me = await call<MeResponse>("GET", "/me", "u_old");
    expect(me.name).toBe("Старый профиль");
    const hinted = await call<MeResponse>("POST", "/me/hints", "u_old", {
      id: "deck_guide",
    });
    expect(hinted.seenHints).toEqual(["deck_guide"]);
  });
});
