import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { RealtimeEvent } from "@/shared/lib/realtime/types";

import { voteCandidates } from "../../plans/matches";
import type { ReservationsView } from "../../wishlist/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
} from "../adapters/memory";
import { parseActivities, parseProducts } from "../catalog-parse";
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

const { items: activities } = parseActivities(
  JSON.parse(
    readFileSync(
      fileURLToPath(
        new URL("../../../../../catalog-stub/activities.json", import.meta.url),
      ),
      "utf8",
    ),
  ),
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
    catalog: createMemoryCatalog(products, activities),
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

describe("боты Санты досылают пропущенное (auto-tasks U04)", () => {
  const BOTS = ["u_azamat", "u_nurai", "u_daniyar"];
  const createGame = async () =>
    (await server.handle({
      method: "POST",
      path: "/santa",
      userId: DEMO_USER_ID,
      body: {
        title: "Офис",
        budget: 2000,
        exchangeDate: "2026-12-28",
        participantIds: BOTS,
      },
    })) as { drawIssue: null | string; game: { id: string } };
  const gameOf = async (id: string) =>
    (await server.deps.db.read()).santaGames[id];

  it("игра создана, пока боты не работали, — после запуска движка позванные вступают", async () => {
    const created = await createGame();
    expect(created.drawIssue).toBe("Ждём, пока вступят: Азамат, Нурай, Данияр");
    // Триггер ушёл в пустоту: движка ещё нет.
    startEngine();
    await flush();
    expect(manual.tasks).toHaveLength(BOTS.length);
    await manual.runAll();
    const game = await gameOf(created.game.id);
    expect([...(game?.participantIds ?? [])].sort()).toEqual(
      [DEMO_USER_ID, ...BOTS].sort(),
    );
  });

  it("повторный resume (смена настроек) не вступает дважды и не пишет строку дважды", async () => {
    startEngine();
    const created = await createGame();
    await flush();
    // Настройки демо поменялись — resume досылает то же самое ещё раз.
    settings.update({ clockOffsetMs: 60_000 });
    bus.publish({ type: "db:changed", scope: ["settings"], by: DEMO_USER_ID });
    await flush();
    // Шаги с тем же ключом уже ждут — второй раз не ставятся.
    expect(manual.tasks.length).toBe(BOTS.length);
    await manual.runAll();
    const game = await gameOf(created.game.id);
    expect(game?.participantIds).toHaveLength(BOTS.length + 1);
    const joinedRows = bus.events.filter(
      (event) =>
        event.type === "bot:action" && event.text.includes("теперь в игре"),
    );
    expect(joinedRows).toHaveLength(BOTS.length);
  });
});

describe("боты голосуют в «Выбрать самим» (auto-tasks U07)", () => {
  // Сценарий «Новый год»: план, где боты уже досвайпали; переводим его к
  // итогам напрямую в базе — дедлайн в тесте не ждём.
  const planAtResults = async () => {
    await server.handle({
      method: "POST",
      path: "/demo/scenario/new-year",
      userId: DEMO_USER_ID,
    });
    const db = server.deps.db as unknown as {
      write: (mutate: (data: never) => void) => Promise<void>;
    };
    await db.write((data: { plans: Record<string, { status: string }> }) => {
      const plan = data.plans.pl_new_year;
      if (plan) plan.status = "results";
    });
    return (await server.deps.db.read()).plans.pl_new_year;
  };

  it("человек проголосовал — боты голосуют за свои лайки среди кандидатов, по разу", async () => {
    const plan = await planAtResults();
    expect(plan?.status).toBe("results");
    startEngine();
    await flush();
    if (!plan) throw new Error("нет плана сценария");
    const [first] = voteCandidates(plan);
    await server.handle({
      method: "POST",
      path: "/plans/pl_new_year/votes",
      userId: DEMO_USER_ID,
      body: { activityId: first },
    });
    await flush();
    const bots = (plan?.participantIds ?? []).filter(
      (id) => id !== DEMO_USER_ID,
    );
    expect(manual.tasks.length).toBe(bots.length);
    for (const { ms } of manual.tasks) {
      expect(ms).toBeGreaterThanOrEqual(3_000 * 0.7);
      expect(ms).toBeLessThanOrEqual(15_000 * 1.4);
    }
    await manual.runAll();
    const after = (await server.deps.db.read()).plans.pl_new_year;
    expect(Object.keys(after?.votes ?? {}).sort()).toEqual(
      [DEMO_USER_ID, ...bots].sort(),
    );
  });

  it("«Выкл» — боты не голосуют", async () => {
    await planAtResults();
    settings.update({ botSpeed: "off" });
    startEngine();
    await flush();
    expect(manual.tasks).toHaveLength(0);
  });
});
