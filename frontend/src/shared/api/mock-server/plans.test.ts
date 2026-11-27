import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { RealtimeEvent } from "@/shared/lib/realtime/types";

import type { Activity, CatalogMeta } from "../catalog/types";
import type { PlanSummary, PlanView } from "../plans/types";
import type { User } from "../users/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
} from "./adapters/memory";
import { type BotScheduler, createDefaultBotEngine } from "./bots";
import {
  parseActivities,
  parseCatalogMeta,
  parseProducts,
} from "./catalog-parse";
import type { SettingsAccess } from "./context";
import { createSeededRandom } from "./random";
import { DEMO_USER_ID, createSeedDb } from "./seed";
import { type MockServer, createMockServer } from "./server";

// «Че делать будем?»: создание плана, вступление, лобби, старт и колода,
// боты в лобби, авторы фото.
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
const meta = parseCatalogMeta(readStub("meta.json")).meta as CatalogMeta;

const NOW = new Date(2026, 10, 27, 12).getTime();
const BOTS = ["u_azamat", "u_nurai", "u_daniyar"];

// Активное и отдых, до 1 000 сом на человека.
const FILTERS = {
  categories: ["active", "chill"],
  budgetPerPerson: { min: 0, max: 1000 },
};

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
      await new Promise((resolve) => setTimeout(resolve, 20));
    },
  };
};

let server: MockServer;
let bus: ReturnType<typeof createBus>;
let settings: SettingsAccess;

const call = <T>(
  method: "GET" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
  query?: Record<string, unknown>,
) => server.handle({ method, path, userId, body, query }) as Promise<T>;

const newUser = (name: string) =>
  call<User>("POST", "/users", null, {
    name,
    avatarColor: "mint",
    interests: [],
    audience: "female",
  });

const createCustom = (userId: string) =>
  call<Activity>("POST", "/activities", userId, {
    title: "Шашлыки у Данияра на даче",
    description: "Берём мангал и гитару",
    pricePerPersonMax: 500,
  });

const createLivePlan = async (extra: Record<string, unknown> = {}) => {
  const custom = await createCustom(DEMO_USER_ID);
  const view = await call<PlanView>("POST", "/plans", DEMO_USER_ID, {
    title: "Пятница вечером",
    mode: "live",
    participantIds: BOTS,
    matchRule: "majority",
    filters: FILTERS,
    customActivityIds: [custom.id],
    ...extra,
  });
  return { custom, view };
};

const planPath = (id: string, action = "") =>
  `/plans/${encodeURIComponent(id)}${action}`;

const triggers = (name: string) =>
  bus.events.filter((event) => event.type === "trigger" && event.name === name);

beforeEach(async () => {
  const clock = createFixedClock(NOW);
  bus = createBus();
  settings = createMemorySettings();
  server = createMockServer({
    catalog: createMemoryCatalog(products, activities, meta),
    clock,
    db: createMemoryDb(async () =>
      createSeedDb({ products, now: clock.now() }),
    ),
    realtime: bus,
    random: createSeededRandom("plans"),
    settings,
  });
  await call("POST", "/auth/demo", null);
});

describe("создание плана", () => {
  it("с 3 ботами и своим занятием: лобби, организатор готов, события", async () => {
    const { custom, view } = await createLivePlan();
    expect(custom).toMatchObject({
      isCustom: true,
      createdBy: DEMO_USER_ID,
      pricePerPersonMin: 500,
      pricePerPersonMax: 500,
    });
    expect(custom.id.startsWith("ca_")).toBe(true);
    const { plan } = view;
    expect(plan).toMatchObject({
      title: "Пятница вечером",
      ownerId: DEMO_USER_ID,
      status: "lobby",
      participantIds: [DEMO_USER_ID, ...BOTS],
      readyIds: [DEMO_USER_ID],
      customActivityIds: [custom.id],
      deck: [],
    });
    expect(view.participants.map((p) => p.name)).toEqual([
      "Айгерим",
      "Азамат",
      "Нурай",
      "Данияр",
    ]);
    // До старта — из чего соберётся колода: своё занятие первым.
    expect(view.activities[0]?.id).toBe(custom.id);
    expect(triggers("plan:created")).toEqual([
      expect.objectContaining({ id: plan.id, by: DEMO_USER_ID }),
    ]);
    expect(
      bus.events.some(
        (event) =>
          event.type === "db:changed" &&
          event.scope.includes("plans") &&
          event.id === plan.id,
      ),
    ).toBe(true);
    expect(triggers("plan:started")).toHaveLength(0);
  });

  it("чужое своё занятие, не друг и пустая колода — ошибка", async () => {
    const stranger = await newUser("Айжан");
    const other = await newUser("Бермет");
    const foreign = await createCustom(stranger.id);
    const base = {
      title: "План",
      mode: "live",
      participantIds: [],
      filters: FILTERS,
    };
    await expect(
      call("POST", "/plans", DEMO_USER_ID, {
        ...base,
        customActivityIds: [foreign.id],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    // Новички дружат только с демо-ботами, не друг с другом.
    await expect(
      call("POST", "/plans", stranger.id, {
        ...base,
        participantIds: [other.id],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      call("POST", "/plans", DEMO_USER_ID, {
        ...base,
        participantIds: ["u_nobody"],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      call("POST", "/plans", DEMO_USER_ID, {
        ...base,
        filters: {
          categories: ["party"],
          budgetPerPerson: { min: 0, max: 100 },
        },
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("«До даты»: без лобби, колода сразу, plan:started", async () => {
    await expect(
      call("POST", "/plans", DEMO_USER_ID, {
        title: "На выходных",
        mode: "deadline",
        participantIds: BOTS,
        filters: FILTERS,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const view = await call<PlanView>("POST", "/plans", DEMO_USER_ID, {
      title: "На выходных",
      mode: "deadline",
      deadline: new Date(NOW + 2 * 24 * 3600_000).toISOString(),
      participantIds: BOTS,
      filters: FILTERS,
    });
    expect(view.plan.status).toBe("swiping");
    expect(view.plan.deck).toHaveLength(5);
    expect(triggers("plan:started")).toHaveLength(1);
  });
});

describe("список планов", () => {
  it("у организатора и у участника, новые сверху, с превью", async () => {
    const { view: first } = await createLivePlan();
    const { view: second } = await createLivePlan({ title: "Суббота" });
    const mine = await call<PlanSummary[]>("GET", "/plans", DEMO_USER_ID);
    expect(mine.map((item) => item.plan.id)).toEqual([
      second.plan.id,
      first.plan.id,
    ]);
    expect(mine[0]?.preview).toHaveLength(3);
    expect(mine[0]?.activityCount).toBe(6);
    expect(mine[0]?.participants).toHaveLength(4);
    const azamat = await call<PlanSummary[]>("GET", "/plans", "u_azamat");
    expect(azamat).toHaveLength(2);
    const stranger = await newUser("Айжан");
    expect(await call("GET", "/plans", stranger.id)).toEqual([]);
  });
});

describe("лобби", () => {
  it("вступление по ссылке и «Готов» другим пользователем", async () => {
    const { view } = await createLivePlan();
    const id = view.plan.id;
    const guest = await newUser("Айжан");
    // До вступления план виден (экран приглашения), но «Готов» нельзя.
    const preview = await call<PlanView>("GET", planPath(id), guest.id);
    expect(preview.plan.title).toBe("Пятница вечером");
    await expect(
      call("POST", planPath(id, "/ready"), guest.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    bus.events.length = 0;
    const joined = await call<PlanView>(
      "POST",
      planPath(id, "/join"),
      guest.id,
    );
    expect(joined.plan.participantIds).toContain(guest.id);
    expect(bus.events).toContainEqual(
      expect.objectContaining({ type: "db:changed", scope: ["plans"], id }),
    );
    // Повторное вступление ничего не меняет.
    const again = await call<PlanView>("POST", planPath(id, "/join"), guest.id);
    expect(
      again.plan.participantIds.filter((pid) => pid === guest.id),
    ).toHaveLength(1);

    const ready = await call<PlanView>(
      "POST",
      planPath(id, "/ready"),
      guest.id,
    );
    expect(ready.plan.readyIds).toEqual([DEMO_USER_ID, guest.id]);
    const unready = await call<PlanView>(
      "POST",
      planPath(id, "/ready"),
      guest.id,
      { ready: false },
    );
    expect(unready.plan.readyIds).toEqual([DEMO_USER_ID]);
    await expect(
      call("POST", planPath(id, "/ready"), DEMO_USER_ID, { ready: false }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // Организатор видит участника сразу.
    const ownerView = await call<PlanView>("GET", planPath(id), DEMO_USER_ID);
    expect(ownerView.participants.map((p) => p.id)).toContain(guest.id);
  });

  it("неизвестный план — NOT_FOUND", async () => {
    await expect(
      call("GET", planPath("pl_nope"), DEMO_USER_ID),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(
      call("POST", planPath("pl_nope", "/join"), DEMO_USER_ID),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("старт и колода", () => {
  it("только организатор и только когда готовы двое", async () => {
    const { view } = await createLivePlan();
    const id = view.plan.id;
    await expect(
      call("POST", planPath(id, "/start"), "u_azamat"),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call("POST", planPath(id, "/start"), DEMO_USER_ID),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("колода собирается один раз, порядок общий, свои + по фильтрам", async () => {
    const { custom, view } = await createLivePlan();
    const id = view.plan.id;
    await call("POST", planPath(id, "/ready"), "u_azamat");
    bus.events.length = 0;
    const started = await call<PlanView>(
      "POST",
      planPath(id, "/start"),
      DEMO_USER_ID,
    );
    const { deck } = started.plan;
    expect(started.plan.status).toBe("swiping");
    expect(new Set(deck)).toEqual(
      new Set([custom.id, "a_002", "a_011", "a_003", "a_004", "a_005"]),
    );
    expect(started.activities.map((a) => a.id)).toEqual(deck);
    expect(triggers("plan:started")).toEqual([
      expect.objectContaining({ id, by: DEMO_USER_ID }),
    ]);
    // Второй старт — CONFLICT, колода не перемешивается заново.
    await expect(
      call("POST", planPath(id, "/start"), DEMO_USER_ID),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // У всех участников — тот же порядок.
    for (const userId of [DEMO_USER_ID, ...BOTS]) {
      const seen = await call<PlanView>("GET", planPath(id), userId);
      expect(seen.plan.deck).toEqual(deck);
      expect(seen.activities.map((a) => a.id)).toEqual(deck);
    }
    // После старта «Готов» уже не жмут.
    await expect(
      call("POST", planPath(id, "/ready"), "u_nurai"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("боты в лобби", () => {
  it("через 1–4 с бот-участник жмёт «Готов», в ленту — строка", async () => {
    const manual = createManualScheduler();
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
    const { view } = await createLivePlan();
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(manual.tasks).toHaveLength(3);
    // Нормальная скорость: 1–4 с × темп бота (0.7–1.4).
    for (const { ms } of manual.tasks) {
      expect(ms).toBeGreaterThanOrEqual(1_000 * 0.7);
      expect(ms).toBeLessThanOrEqual(4_000 * 1.4);
    }
    await manual.runAll();
    const seen = await call<PlanView>(
      "GET",
      planPath(view.plan.id),
      DEMO_USER_ID,
    );
    expect(new Set(seen.plan.readyIds)).toEqual(
      new Set([DEMO_USER_ID, ...BOTS]),
    );
    const reports = bus.events.filter((event) => event.type === "bot:action");
    expect(reports).toHaveLength(3);
    expect(reports.map((r) => r.type === "bot:action" && r.text)).toContain(
      "Азамат готов в плане «Пятница вечером»",
    );
    expect(reports.map((r) => r.type === "bot:action" && r.text)).toContain(
      "Нурай готова в плане «Пятница вечером»",
    );
    // Готовы все — организатор может запускать.
    const started = await call<PlanView>(
      "POST",
      planPath(view.plan.id, "/start"),
      DEMO_USER_ID,
    );
    expect(started.plan.status).toBe("swiping");
    engine.stop();
  });
});

describe("занятия и авторы фото", () => {
  it("GET /activities фильтрует каталог по фильтрам плана", async () => {
    const all = await call<Activity[]>("GET", "/activities", DEMO_USER_ID);
    expect(all).toHaveLength(activities.length);
    const filtered = await call<Activity[]>(
      "GET",
      "/activities",
      DEMO_USER_ID,
      undefined,
      { filters: JSON.stringify(FILTERS) },
    );
    expect(filtered.map((a) => a.id).sort()).toEqual(
      ["a_002", "a_003", "a_004", "a_005", "a_011"].sort(),
    );
  });

  it("GET /catalog/meta отдаёт авторов фото всех занятий с фото", async () => {
    const response = await call<CatalogMeta>("GET", "/catalog/meta", null);
    const credited = new Set(
      response.activityPhotoCredits.map((credit) => credit.activityId),
    );
    for (const activity of activities.filter((a) => a.image)) {
      expect(credited.has(activity.id)).toBe(true);
    }
    expect(response.activityPhotoCredits[0]).toMatchObject({
      author: expect.any(String),
      license: expect.any(String),
      url: expect.stringMatching(/^https:\/\//),
    });
  });

  it("битая запись автора пропускается, битая шапка — meta: null", () => {
    const parsed = parseCatalogMeta({
      ...meta,
      activityPhotoCredits: [
        ...meta.activityPhotoCredits,
        { activityId: "a_999" },
        meta.activityPhotoCredits[0],
      ],
    });
    expect(parsed.meta?.activityPhotoCredits).toHaveLength(
      meta.activityPhotoCredits.length,
    );
    expect(parsed.dropped).toHaveLength(2);
    expect(parseCatalogMeta({ activityPhotoCredits: [] }).meta).toBeNull();
  });
});
