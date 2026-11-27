import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { RealtimeEvent } from "@/shared/lib/realtime/types";

import { DEFAULT_DEMO_SETTINGS } from "../demo/constants";
import { computeMatches } from "../plans/matches";
import type { PlanView } from "../plans/types";
import type { SantaView } from "../santa/types";
import type {
  FriendSummary,
  ImportantDateView,
  MeResponse,
  User,
} from "../users/types";
import type { WishlistResponse } from "../wishlist/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
} from "./adapters/memory";
import { type BotScheduler, createDefaultBotEngine } from "./bots";
import { parseActivities, parseProducts } from "./catalog-parse";
import type { SettingsAccess } from "./context";
import type { Db } from "./db";
import { createSeededRandom } from "./random";
import { DEMO_USER_ID, createSeedDb } from "./seed";
import { type MockServer, createMockServer } from "./server";

// Сценарий «Новый год» (TASKS T19): POST /demo/scenario/new-year собирает
// всё для показа поверх свежего сида — и боты потом продолжают сами.
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

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date(2026, 10, 27, 12).getTime();
const SCENARIO = "/demo/scenario/new-year";

type ScenarioResult = { ok: true; planId: string; santaId: string };

const createBus = () => {
  const handlers = new Set<(event: RealtimeEvent) => void>();
  const events: RealtimeEvent[] = [];
  return {
    events,
    publish(event: RealtimeEvent) {
      events.push(event);
      handlers.forEach((handler) => handler(event));
    },
    subscribe(handler: (event: RealtimeEvent) => void) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
};

const createManualScheduler = () => {
  const tasks: Array<() => void> = [];
  const scheduler: BotScheduler = {
    after(_ms, task) {
      tasks.push(task);
      return () => {
        const index = tasks.indexOf(task);
        if (index >= 0) tasks.splice(index, 1);
      };
    },
  };
  return {
    scheduler,
    drain: async () => {
      for (let round = 0; round < 100 && tasks.length > 0; round += 1) {
        tasks.splice(0).forEach((task) => task());
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
    },
  };
};

let server: MockServer;
let bus: ReturnType<typeof createBus>;
let settings: SettingsAccess;
let memoryDb: ReturnType<typeof createMemoryDb>;

const call = <T>(
  method: "GET" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
) => server.handle({ method, path, userId, body }) as Promise<T>;

const loadScenario = (userId: null | string = null) =>
  call<ScenarioResult>("POST", SCENARIO, userId);

beforeEach(() => {
  const clock = createFixedClock(NOW);
  bus = createBus();
  // Перед сценарием настройки «испорчены»: перемотка и быстрые боты.
  settings = createMemorySettings({
    ...DEFAULT_DEMO_SETTINGS,
    botSpeed: "fast",
    clockOffsetMs: 3 * DAY,
  });
  memoryDb = createMemoryDb(async () =>
    createSeedDb({ products, now: clock.now() }),
  );
  server = createMockServer({
    catalog: createMemoryCatalog(products, activities),
    clock,
    db: memoryDb,
    realtime: bus,
    random: createSeededRandom("scenario"),
    settings,
  });
});

describe("POST /demo/scenario/new-year", () => {
  it("без сессии: ответ с id плана и игры, Айгерим — человек, настройки сброшены", async () => {
    const result = await loadScenario();
    expect(result).toEqual({
      ok: true,
      planId: expect.any(String),
      santaId: expect.any(String),
    });
    const me = await call<User>("GET", "/me", DEMO_USER_ID);
    expect(me.isBot).toBe(false);
    expect(settings.get()).toEqual(DEFAULT_DEMO_SETTINGS);
    expect(bus.events).toContainEqual(
      expect.objectContaining({
        type: "db:changed",
        scope: expect.arrayContaining([
          "plans",
          "santa",
          "settings",
          "wishlist",
        ]),
      }),
    );
  });

  it("вишлист: 7 желаний, «Очень хочу», заметка, вариант, повод «Новый год»", async () => {
    await loadScenario();
    const wishlist = await call<WishlistResponse>(
      "GET",
      "/wishlist",
      DEMO_USER_ID,
    );
    const active = wishlist.items.filter((item) => item.status === "active");
    expect(active).toHaveLength(7);
    expect(active.filter((item) => item.priority === "top")).toHaveLength(2);
    expect(active.filter((item) => item.note)).toHaveLength(1);
    expect(active.some((item) => item.variantChoice)).toBe(true);
    expect(wishlist.wishCount).toBe(7);
    expect(wishlist.meta).toMatchObject({
      occasion: { kind: "new_year", date: "2026-12-31" },
      message: expect.any(String),
      shareUnlockedAt: expect.any(String),
    });
  });

  it("этап 7: у Айгерим вкус по вишлисту, день рождения и «Годовщина»; ссылку можно отправить", async () => {
    await loadScenario();
    const me = await call<MeResponse>("GET", "/me", DEMO_USER_ID);
    expect(me.name).toBe("Айгерим");
    expect(me.birthday).toBe("03-14");
    expect(me.taste?.likes).toBe(7);
    expect(me.inferredInterests.length).toBeGreaterThan(0);
    const dates = await call<ImportantDateView[]>(
      "GET",
      "/me/dates",
      DEMO_USER_ID,
    );
    expect(dates).toEqual([
      expect.objectContaining({ preset: "anniversary", title: "Годовщина" }),
    ]);
    const { url } = await call<{ url: string }>(
      "POST",
      "/wishlist/share",
      DEMO_USER_ID,
    );
    expect(url).toMatch(/^\/w\/\?d=/);
  });

  it("у Нурай день рождения через 5 дней", async () => {
    await loadScenario();
    const friends = await call<FriendSummary[]>(
      "GET",
      "/friends",
      DEMO_USER_ID,
    );
    const nurai = friends.find((friend) => friend.user.id === "u_nurai");
    expect(nurai?.daysToBirthday).toBe(5);
  });

  it("план «Новогодние каникулы»: «До даты», двое ботов досвайпали, Айгерим — нет", async () => {
    const { planId } = await loadScenario();
    const view = await call<PlanView>("GET", `/plans/${planId}`, DEMO_USER_ID);
    const { plan } = view;
    expect(plan).toMatchObject({
      title: "Новогодние каникулы",
      ownerId: DEMO_USER_ID,
      mode: "deadline",
      status: "swiping",
      deadline: new Date(NOW + 3 * DAY).toISOString(),
    });
    expect(plan.participantIds).toHaveLength(4);
    expect(plan.participantIds[0]).toBe(DEMO_USER_ID);
    expect(plan.deck.length).toBeGreaterThan(0);
    expect(view.activities).toHaveLength(plan.deck.length);
    expect(plan.finishedIds).toHaveLength(2);
    const db = memoryDb.snapshot() as Db;
    for (const id of plan.finishedIds) {
      expect(db.users[id]?.isBot).toBe(true);
      expect(Object.keys(plan.swipes[id] ?? {})).toHaveLength(plan.deck.length);
    }
    expect(plan.swipes[DEMO_USER_ID]).toBeUndefined();

    // Общий лайк досвайпавших + «Хочу» Айгерим — уже «почти совпадение».
    const common = plan.deck.find((id) =>
      plan.finishedIds.every((botId) => plan.swipes[botId]?.[id] === "like"),
    );
    expect(common).toBeDefined();
    const after = await call<PlanView>(
      "POST",
      `/plans/${planId}/swipes`,
      DEMO_USER_ID,
      { activityId: common, decision: "like" },
    );
    const { matches, almost } = computeMatches(after.plan);
    expect(
      [...matches, ...almost].some((entry) => entry.activityId === common),
    ).toBe(true);
  });

  it("план по DEMO.md: «Совпадение!» на 2-м свайпе вправо, к итогам — 2+ совпадения", async () => {
    const { planId } = await loadScenario();
    const { plan } = await call<PlanView>(
      "GET",
      `/plans/${planId}`,
      DEMO_USER_ID,
    );
    const likedByBots = (id: string, bots: string[]) =>
      bots.every((botId) => plan.swipes[botId]?.[id] === "like");
    const bots = plan.participantIds.filter((id) => id !== DEMO_USER_ID);
    const swiping = bots.filter((id) => !plan.finishedIds.includes(id));
    expect(swiping).toHaveLength(1);
    const unswiped = plan.deck.filter(
      (id) => plan.swipes[swiping[0] ?? ""]?.[id] === undefined,
    );
    // Третий бот ещё в пути — но его живые свайпы итог не меняют: где он
    // не свайпал, досвайпавшие оба «за» не бывают.
    expect(unswiped.length).toBeGreaterThan(0);
    for (const id of unswiped) {
      expect(likedByBots(id, plan.finishedIds)).toBe(false);
    }

    // Айгерим свайпает вправо подряд: совпадение — на 2-й карточке.
    const matchedAt: number[] = [];
    for (const [index, activityId] of plan.deck.entries()) {
      const before = computeMatches(
        (memoryDb.snapshot() as Db).plans[planId] ?? plan,
      ).matches.length;
      const after = await call<PlanView>(
        "POST",
        `/plans/${planId}/swipes`,
        DEMO_USER_ID,
        { activityId, decision: "like" },
      );
      if (computeMatches(after.plan).matches.length > before) {
        matchedAt.push(index + 1);
      }
    }
    expect(matchedAt[0]).toBe(2);
    expect(matchedAt.length).toBeGreaterThanOrEqual(2);
    // Все совпадения — среди первых 5 карточек: «4–5 билетиков» хватает.
    expect(matchedAt.every((position) => position <= 5)).toBe(true);
  });

  it("Санта: у любого подопечного 4+ желаний в рамках бюджета", async () => {
    const { santaId } = await loadScenario();
    const db = memoryDb.snapshot() as Db;
    const game = db.santaGames[santaId];
    const prices = new Map(products.map((p) => [p.id, p.priceMin]));
    for (const id of game?.participantIds ?? []) {
      if (id === DEMO_USER_ID) continue;
      const fit = (db.wishlistItems[id] ?? []).filter(
        (item) =>
          item.status === "active" &&
          item.source.kind === "product" &&
          (prices.get(item.source.productId) ?? Infinity) <= 2000,
      );
      expect(fit.length).toBeGreaterThanOrEqual(4);
      // Свайпы — под вишлист: у каждого желания есть свой «Хочу».
      for (const item of db.wishlistItems[id] ?? []) {
        if (item.source.kind !== "product") continue;
        const productId = item.source.productId;
        expect(
          db.productSwipes.some(
            (swipe) => swipe.userId === id && swipe.productId === productId,
          ),
        ).toBe(true);
      }
    }

    await call("POST", `/santa/${santaId}/draw`, DEMO_USER_ID);
    const view = await call<SantaView>(
      "GET",
      `/santa/${santaId}`,
      DEMO_USER_ID,
    );
    const ward = view.me?.ward;
    expect(ward).toBeTruthy();
    const inBudget = ward?.wishlist.filter((item) => !item.overBudget) ?? [];
    expect(inBudget.length).toBeGreaterThanOrEqual(4);
  });

  it("Тайный Санта «Офис, Новый год»: 6 вступивших с вишлистами, можно жеребьёвку", async () => {
    const { santaId } = await loadScenario();
    const view = await call<SantaView>(
      "GET",
      `/santa/${santaId}`,
      DEMO_USER_ID,
    );
    expect(view.game).toMatchObject({
      title: "Офис, Новый год",
      ownerId: DEMO_USER_ID,
      budget: 2000,
      exchangeDate: "2026-12-27",
      status: "gathering",
      invitedIds: [],
    });
    expect(view.game.drawAt).toBeUndefined();
    expect(view.role).toBe("owner");
    expect(view.members).toHaveLength(6);
    expect(view.members.every((member) => member.joined)).toBe(true);
    expect(view.members.every((member) => member.hasWishlist)).toBe(true);
    expect(view.drawIssue).toBeNull();
  });

  it("повторный вызов — снова свежий сценарий", async () => {
    const first = await loadScenario(DEMO_USER_ID);
    const snapshot = structuredClone(memoryDb.snapshot());
    await call("POST", `/plans/${first.planId}/swipes`, DEMO_USER_ID, {
      activityId: snapshot?.plans[first.planId]?.deck[0],
      decision: "pass",
    });
    await call("POST", `/santa/${first.santaId}/draw`, DEMO_USER_ID);
    const second = await loadScenario(DEMO_USER_ID);
    expect(second).toEqual(first);
    expect(memoryDb.snapshot()).toEqual(snapshot);
  });

  it("боты продолжают: третий бот досвайпывает план после загрузки", async () => {
    const { scheduler, drain } = createManualScheduler();
    const engine = createDefaultBotEngine({
      clock: server.deps.clock,
      db: server.deps.db,
      handle: (request) => server.handle(request),
      publish: bus.publish,
      random: createSeededRandom("bots"),
      scheduler,
      settings,
      subscribe: bus.subscribe,
    });
    engine.start();
    const { planId } = await loadScenario();
    // resume движка асинхронный: даём ему прочитать план и поставить шаги.
    await new Promise((resolve) => setTimeout(resolve, 20));
    await drain();
    engine.stop();
    const plan = (memoryDb.snapshot() as Db).plans[planId];
    expect(plan?.finishedIds).toHaveLength(3);
    expect(plan?.finishedIds).not.toContain(DEMO_USER_ID);
    expect(plan?.status).toBe("swiping");
    expect(plan?.swipes[DEMO_USER_ID]).toBeUndefined();
  });

  it("итоги не зависят от третьего бота: те же совпадения, что и до его свайпов", async () => {
    const { planId } = await loadScenario();
    const initial = (memoryDb.snapshot() as Db).plans[planId];
    // Айгерим — вправо на первые 5, как в DEMO.md.
    for (const activityId of initial?.deck.slice(0, 5) ?? []) {
      await call("POST", `/plans/${planId}/swipes`, DEMO_USER_ID, {
        activityId,
        decision: "like",
      });
    }
    const expected = computeMatches(
      (memoryDb.snapshot() as Db).plans[planId] ?? initial!,
    ).matches.map((match) => match.activityId);
    expect(expected.length).toBeGreaterThanOrEqual(2);

    const { scheduler, drain } = createManualScheduler();
    const engine = createDefaultBotEngine({
      clock: server.deps.clock,
      db: server.deps.db,
      handle: (request) => server.handle(request),
      publish: bus.publish,
      random: createSeededRandom("other-bots"),
      scheduler,
      settings,
      subscribe: bus.subscribe,
    });
    engine.start();
    bus.publish({ type: "db:changed", scope: ["settings"], by: "test" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await drain();
    engine.stop();
    const plan = (memoryDb.snapshot() as Db).plans[planId];
    // Третий бот досвайпал сам (в заглушке колода короткая — Айгерим тоже).
    expect(plan?.finishedIds).toContain("u_meerim");
    expect(
      computeMatches(plan!).matches.map((match) => match.activityId),
    ).toEqual(expected);
  });
});
