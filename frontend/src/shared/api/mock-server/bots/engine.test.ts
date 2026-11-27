import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { RealtimeEvent } from "@/shared/lib/realtime/types";

import type { ReservationsView } from "../../wishlist/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
} from "../adapters/memory";
import { parseProducts } from "../catalog-parse";
import type { SettingsAccess } from "../context";
import { createSeededRandom } from "../random";
import { DEMO_USER_ID, createSeedDb } from "../seed";
import { type MockServer, createMockServer } from "../server";
import { type BotScheduler, createDefaultBotEngine } from "./index";

// Движок ботов: реакция на триггеры, скорость, выключение, остановка.
const stubPath = fileURLToPath(
  new URL("../../../../../catalog-stub/products.json", import.meta.url),
);
const { items: products } = parseProducts(
  JSON.parse(readFileSync(stubPath, "utf8")),
);

const NOW = new Date(2026, 10, 26, 12).getTime();

// Шина в памяти: публикация сразу доходит до подписчиков.
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

// Ручной планировщик: задачи копятся, тест запускает их сам.
const createManualScheduler = () => {
  const tasks: Array<{ ms: number; task: () => void }> = [];
  const scheduler: BotScheduler = {
    after(ms, task) {
      const entry = { ms, task };
      tasks.push(entry);
      return () => {
        const index = tasks.indexOf(entry);
        if (index >= 0) tasks.splice(index, 1);
      };
    },
  };
  return {
    scheduler,
    tasks,
    runAll: async () => {
      const due = tasks.splice(0);
      due.forEach((entry) => entry.task());
      // Задачи асинхронные: даём им дойти до конца.
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
  };
};

let server: MockServer;
let bus: ReturnType<typeof createBus>;
let settings: SettingsAccess;
let manual: ReturnType<typeof createManualScheduler>;

const flush = () => new Promise((resolve) => setTimeout(resolve, 20));

const startEngine = () => {
  const engine = createDefaultBotEngine({
    clock: server.deps.clock,
    db: server.deps.db,
    handle: (request) => server.handle(request),
    publish: bus.publish,
    random: createSeededRandom("bots"),
    scheduler: manual.scheduler,
    settings,
    subscribe: bus.subscribe,
  });
  engine.start();
  return engine;
};

const shareTrigger = (ownerId: string): RealtimeEvent => ({
  type: "trigger",
  name: "wishlist:shared",
  id: ownerId,
  by: ownerId,
});

const ownerCount = async () => {
  const view = await server.handle({
    method: "GET",
    path: "/reservations",
    query: { ownerId: DEMO_USER_ID },
    userId: DEMO_USER_ID,
  });
  return (view as ReservationsView & { role: "owner" }).count;
};

beforeEach(async () => {
  const clock = createFixedClock(NOW);
  bus = createBus();
  settings = createMemorySettings();
  manual = createManualScheduler();
  server = createMockServer({
    catalog: createMemoryCatalog(products),
    clock,
    db: createMemoryDb(async () =>
      createSeedDb({ products, now: clock.now() }),
    ),
    realtime: bus,
    random: createSeededRandom("test"),
    settings,
  });
  await server.handle({ method: "POST", path: "/auth/demo", userId: null });
});

describe("боты и вишлист", () => {
  it("после отправки 1–2 бота бронируют по подарку, в ленту — строка", async () => {
    startEngine();
    bus.publish(shareTrigger(DEMO_USER_ID));
    await flush();
    expect(manual.tasks.length).toBeGreaterThanOrEqual(1);
    expect(manual.tasks.length).toBeLessThanOrEqual(2);
    // Нормальная скорость: 30–90 с × темп бота (0.7–1.4).
    for (const { ms } of manual.tasks) {
      expect(ms).toBeGreaterThanOrEqual(30_000 * 0.7);
      expect(ms).toBeLessThanOrEqual(90_000 * 1.4);
    }
    const planned = manual.tasks.length;
    await manual.runAll();
    expect(await ownerCount()).toBe(planned);
    const reports = bus.events.filter((event) => event.type === "bot:action");
    expect(reports).toHaveLength(planned);
    expect(reports[0]?.type === "bot:action" && reports[0].text).toMatch(
      /забронировал.* подарок у Айгерим/,
    );
  });

  it("повторная отправка не даёт тому же боту второй брони", async () => {
    startEngine();
    for (let round = 0; round < 6; round += 1) {
      bus.publish(shareTrigger(DEMO_USER_ID));
      await flush();
      await manual.runAll();
    }
    const db = await server.deps.db.read();
    const mine = db.reservations.filter(
      (entry) => entry.ownerId === DEMO_USER_ID && !entry.closedAt,
    );
    const reservers = mine.map((entry) => entry.reserver.userId);
    expect(new Set(reservers).size).toBe(reservers.length);
  });

  it("«Быстро» — короче, «Выкл» — ничего не планирует и не выполняет", async () => {
    settings.update({ botSpeed: "fast" });
    startEngine();
    bus.publish(shareTrigger(DEMO_USER_ID));
    await flush();
    for (const { ms } of manual.tasks) {
      expect(ms).toBeLessThanOrEqual(90_000 * 1.4 * 0.3);
    }
    // Выключили, пока бот «думал»: задача срабатывает, но ничего не делает.
    settings.update({ botSpeed: "off" });
    await manual.runAll();
    expect(await ownerCount()).toBe(0);
    bus.publish(shareTrigger(DEMO_USER_ID));
    await flush();
    expect(manual.tasks).toHaveLength(0);
  });

  it("stop() отменяет запланированное и отписывается", async () => {
    const engine = startEngine();
    bus.publish(shareTrigger(DEMO_USER_ID));
    await flush();
    engine.stop();
    expect(manual.tasks).toHaveLength(0);
    bus.publish(shareTrigger(DEMO_USER_ID));
    await flush();
    expect(manual.tasks).toHaveLength(0);
  });

  it("POST /wishlist/share сам будит ботов — без ручного триггера", async () => {
    startEngine();
    await server.handle({
      method: "POST",
      path: "/wishlist/share",
      userId: DEMO_USER_ID,
    });
    await flush();
    expect(manual.tasks.length).toBeGreaterThanOrEqual(1);
    await manual.runAll();
    expect(await ownerCount()).toBeGreaterThanOrEqual(1);
  });
});
