import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { RealtimeEvent } from "@/shared/lib/realtime/types";

import type { Activity } from "../catalog/types";
import { isTimedOutWithoutResults } from "../plans/close";
import {
  computeMatches,
  decisionCandidates,
  voteCandidates,
} from "../plans/matches";
import type { PlanSummary, PlanView } from "../plans/types";
import type { User } from "../users/types";
import {
  createFixedClock,
  createMemoryCatalog,
  createMemoryDb,
  createMemorySettings,
} from "./adapters/memory";
import { type BotScheduler, createDefaultBotEngine } from "./bots";
import { parseActivities, parseProducts } from "./catalog-parse";
import { createSeededRandom } from "./random";
import { DEMO_USER_ID, createSeedDb } from "./seed";
import { type MockServer, createMockServer } from "./server";

// «Че делать будем?» после колоды (T15): голоса, барабан, «Решено»,
// отмена решения, выходы из «Совпадений нет», дедлайны «До даты» и боты
// в этом режиме.
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
const DAY = 24 * 3600_000;
const BOTS = ["u_azamat", "u_nurai", "u_daniyar"];
const EVERYONE = [DEMO_USER_ID, ...BOTS];

// Активное и отдых, до 1 000 сом: колода из 5 занятий каталога.
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
  const runAll = async () => {
    const due = tasks.splice(0);
    due.forEach((entry) => entry.task());
    await new Promise((resolve) => setTimeout(resolve, 20));
  };
  return {
    scheduler,
    tasks,
    runAll,
    drain: async () => {
      for (let round = 0; round < 100 && tasks.length > 0; round += 1) {
        await runAll();
      }
    },
  };
};

// Сервер целиком — чтобы для проверки барабана поднять второй такой же.
const createWorld = (seed = "results") => {
  const clock = createFixedClock(NOW);
  const bus = createBus();
  const settings = createMemorySettings();
  const server = createMockServer({
    catalog: createMemoryCatalog(products, activities),
    clock,
    db: createMemoryDb(async () =>
      createSeedDb({ products, now: clock.now() }),
    ),
    realtime: bus,
    random: createSeededRandom(seed),
    settings,
  });
  return { bus, clock, server, settings };
};

let world: ReturnType<typeof createWorld>;
let server: MockServer;

const call = <T>(
  method: "GET" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
) => server.handle({ method, path, userId, body }) as Promise<T>;

const planPath = (id: string, action = "") =>
  `/plans/${encodeURIComponent(id)}${action}`;

const eventsOf = <T extends RealtimeEvent["type"]>(type: T) =>
  world.bus.events.filter(
    (event): event is Extract<RealtimeEvent, { type: T }> =>
      event.type === type,
  );

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

const newUser = (name: string) =>
  call<User>("POST", "/users", null, {
    name,
    avatarColor: "mint",
    interests: [],
    audience: "female",
  });

const swipe = (
  id: string,
  userId: string,
  activityId: string,
  decision: "like" | "pass",
) =>
  call<PlanView>("POST", planPath(id, "/swipes"), userId, {
    activityId,
    decision,
  });

const startLive = async (
  matchRule: "all" | "majority",
  guests: string[] = [],
) => {
  const created = await call<PlanView>("POST", "/plans", DEMO_USER_ID, {
    title: "Пятница вечером",
    mode: "live",
    participantIds: BOTS,
    matchRule,
    filters: FILTERS,
  });
  const id = created.plan.id;
  for (const guest of guests) {
    await call("POST", planPath(id, "/join"), guest);
  }
  await call("POST", planPath(id, "/ready"), "u_azamat");
  return call<PlanView>("POST", planPath(id, "/start"), DEMO_USER_ID);
};

// Участники (по умолчанию все) проходят колоду по строкам: "LLP" — первые
// две карточки лайк, остальные — пас; нет строки — пас на всё.
const playDeck = async (
  view: PlanView,
  rows: Record<string, string>,
  players = view.plan.participantIds,
) => {
  let last = view;
  for (const userId of players) {
    const row = rows[userId] ?? "";
    for (const [index, card] of view.plan.deck.entries()) {
      last = await swipe(
        view.plan.id,
        userId,
        card,
        row[index] === "L" ? "like" : "pass",
      );
    }
  }
  return last;
};

// План на результатах: по умолчанию все лайкнули первые две карточки.
const toResults = async (
  rows: Record<string, string> = Object.fromEntries(
    EVERYONE.map((id) => [id, "LL"]),
  ),
  matchRule: "all" | "majority" = "all",
  guests: string[] = [],
) => {
  const started = await startLive(matchRule, guests);
  const view = await playDeck(started, rows);
  expect(view.plan.status).toBe("results");
  return view;
};

const vote = (id: string, userId: string, activityId: null | string) =>
  call<PlanView>("POST", planPath(id, "/votes"), userId, { activityId });

const decide = (id: string, userId: string, body: unknown) =>
  call<PlanView>("POST", planPath(id, "/decide"), userId, body);

beforeEach(async () => {
  world = createWorld();
  server = world.server;
  await call("POST", "/auth/demo", null);
});

describe("голосование «Выбрать самим»", () => {
  it("один голос на человека, повтор заменяет, null снимает", async () => {
    const view = await toResults();
    const id = view.plan.id;
    const [first = "", second = "", third = ""] = view.plan.deck;
    await vote(id, DEMO_USER_ID, first);
    let last = await vote(id, "u_azamat", first);
    expect(last.plan.votes).toEqual({
      [DEMO_USER_ID]: first,
      u_azamat: first,
    });
    world.bus.events.length = 0;
    last = await vote(id, DEMO_USER_ID, second);
    expect(last.plan.votes[DEMO_USER_ID]).toBe(second);
    expect(eventsOf("db:changed")).toEqual([
      expect.objectContaining({ scope: ["plans"], id }),
    ]);
    last = await vote(id, DEMO_USER_ID, null);
    expect(last.plan.votes).toEqual({ u_azamat: first });
    // Голосуют только за совпадения, если они есть.
    await expect(vote(id, DEMO_USER_ID, third)).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      call("POST", planPath(id, "/votes"), DEMO_USER_ID, {}),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const stranger = await newUser("Айжан");
    await expect(vote(id, stranger.id, first)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("до результатов голосовать нельзя; без совпадений — за любое занятие", async () => {
    const started = await startLive("all");
    const id = started.plan.id;
    const card = started.plan.deck[3] ?? "";
    await expect(vote(id, DEMO_USER_ID, card)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    const view = await playDeck(started, {});
    expect(decisionCandidates(view.plan, view.activities)).toEqual({
      pool: [],
      source: "none",
    });
    expect(voteCandidates(view.plan, view.activities)).toEqual(view.plan.deck);
    const voted = await vote(id, DEMO_USER_ID, card);
    expect(voted.plan.votes[DEMO_USER_ID]).toBe(card);
  });
});

describe("решение", () => {
  it("барабан: крутит только организатор, итог — из пула, у сервера", async () => {
    const view = await toResults();
    const id = view.plan.id;
    const { pool, source } = decisionCandidates(view.plan, view.activities);
    expect(source).toBe("matches");
    expect(pool).toHaveLength(2);
    await expect(
      decide(id, "u_azamat", { method: "random" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    world.bus.events.length = 0;
    world.clock.advance(60_000);
    const decided = await decide(id, DEMO_USER_ID, { method: "random" });
    expect(decided.plan.status).toBe("decided");
    expect(decided.plan.decision).toEqual({
      activityId: expect.any(String),
      method: "random",
      decidedAt: new Date(NOW + 60_000).toISOString(),
    });
    expect(pool).toContain(decided.plan.decision?.activityId);
    expect(eventsOf("db:changed")).toEqual([
      expect.objectContaining({ scope: ["plans"], id }),
    ]);

    // Тот же сид и те же действия — тот же итог: выбирает ctx.random.
    const mainWorld = world;
    world = createWorld();
    server = world.server;
    await call("POST", "/auth/demo", null);
    const twin = await toResults();
    const twinDecided = await decide(twin.plan.id, DEMO_USER_ID, {
      method: "random",
    });
    expect(twinDecided.plan.decision?.activityId).toBe(
      decided.plan.decision?.activityId,
    );
    world = mainWorld;
    server = mainWorld.server;
  });

  it("без совпадений барабан крутится среди «почти», без них — CONFLICT", async () => {
    // Правило «все»: третью карточку лайкнули трое из четырёх.
    const almost = await toResults({
      [DEMO_USER_ID]: "PPL",
      u_azamat: "PPL",
      u_nurai: "PPL",
    });
    const third = almost.plan.deck[2];
    expect(decisionCandidates(almost.plan, almost.activities)).toEqual({
      pool: [third],
      source: "almost",
    });
    const decided = await decide(almost.plan.id, DEMO_USER_ID, {
      method: "random",
    });
    expect(decided.plan.decision?.activityId).toBe(third);

    const none = await toResults({});
    await expect(
      decide(none.plan.id, DEMO_USER_ID, { method: "random" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      (await call<PlanView>("GET", planPath(none.plan.id), DEMO_USER_ID)).plan
        .status,
    ).toBe("results");
  });

  it("решённый план второй раз не решается, scheduledFor сохраняется", async () => {
    const view = await toResults();
    const id = view.plan.id;
    const card = view.plan.deck[1] ?? "";
    const scheduledFor = new Date(NOW + DAY).toISOString();
    const decided = await decide(id, DEMO_USER_ID, {
      method: "owner",
      activityId: card,
      scheduledFor,
    });
    expect(decided.plan.decision).toMatchObject({
      activityId: card,
      method: "owner",
      scheduledFor,
    });
    for (const body of [
      { method: "random" },
      { method: "owner", activityId: view.plan.deck[0] },
    ]) {
      await expect(decide(id, DEMO_USER_ID, body)).rejects.toMatchObject({
        code: "CONFLICT",
        message: "Решение уже принято — сначала отмени его",
      });
    }
    await expect(vote(id, "u_azamat", card)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // В списке планов решение — первым в превью.
    const list = await call<PlanSummary[]>("GET", "/plans", DEMO_USER_ID);
    expect(list[0]?.preview[0]?.id).toBe(card);
  });

  it("«Утвердить»: только лидер голосования", async () => {
    const view = await toResults();
    const id = view.plan.id;
    const [first = "", second = ""] = view.plan.deck;
    await expect(
      decide(id, DEMO_USER_ID, { method: "vote", activityId: first }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await vote(id, DEMO_USER_ID, first);
    await vote(id, "u_azamat", second);
    await vote(id, "u_nurai", second);
    await expect(
      decide(id, DEMO_USER_ID, { method: "vote", activityId: first }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      decide(id, "u_azamat", { method: "vote", activityId: second }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const decided = await decide(id, DEMO_USER_ID, {
      method: "vote",
      activityId: second,
    });
    expect(decided.plan.decision).toMatchObject({
      activityId: second,
      method: "vote",
    });
  });

  it("организатор выбирает сам — любое занятие колоды", async () => {
    const view = await toResults();
    const id = view.plan.id;
    await expect(
      decide(id, DEMO_USER_ID, { method: "owner" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      decide(id, DEMO_USER_ID, { method: "owner", activityId: "a_999" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      decide(id, DEMO_USER_ID, { method: "coin" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const last = view.plan.deck.at(-1) ?? "";
    const decided = await decide(id, DEMO_USER_ID, {
      method: "owner",
      activityId: last,
    });
    expect(decided.plan.decision?.activityId).toBe(last);
  });

  it("во время свайпа решать нельзя", async () => {
    const started = await startLive("all");
    await expect(
      decide(started.plan.id, DEMO_USER_ID, { method: "random" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("«Отменить решение»", () => {
  it("только организатор; все снова на результатах, тост — только людям", async () => {
    const guest = await newUser("Айжан");
    const view = await toResults(
      Object.fromEntries([...EVERYONE, guest.id].map((id) => [id, "LL"])),
      "all",
      [guest.id],
    );
    const id = view.plan.id;
    await vote(id, guest.id, view.plan.deck[0] ?? "");
    await decide(id, DEMO_USER_ID, { method: "random" });
    for (const userId of ["u_azamat", guest.id]) {
      await expect(
        call("POST", planPath(id, "/decide/cancel"), userId),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    world.bus.events.length = 0;
    const cancelled = await call<PlanView>(
      "POST",
      planPath(id, "/decide/cancel"),
      DEMO_USER_ID,
    );
    expect(cancelled.plan.status).toBe("results");
    expect(cancelled.plan.decision).toBeUndefined();
    expect(cancelled.plan.votes).toEqual({});
    expect(eventsOf("toast")).toEqual([
      {
        type: "toast",
        text: "Организатор отменил решение",
        forUserId: guest.id,
      },
    ]);
    expect(eventsOf("db:changed")).toEqual([
      expect.objectContaining({ scope: ["plans"], id }),
    ]);
    await expect(
      call("POST", planPath(id, "/decide/cancel"), DEMO_USER_ID),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // После отмены барабан снова доступен.
    const again = await decide(id, DEMO_USER_ID, { method: "random" });
    expect(again.plan.status).toBe("decided");
  });
});

describe("выходы из «Совпадений нет»", () => {
  it("«Считать по большинству»: правило меняется, голоса за выбывших снимаются", async () => {
    // Большинство: первую лайкнули все, вторую — трое.
    const view = await toResults(
      {
        [DEMO_USER_ID]: "LL",
        u_azamat: "LL",
        u_nurai: "LL",
        u_daniyar: "L",
      },
      "majority",
    );
    const id = view.plan.id;
    const [first = "", second = ""] = view.plan.deck;
    await vote(id, DEMO_USER_ID, first);
    await vote(id, "u_azamat", second);
    await expect(
      call("POST", planPath(id, "/rule"), "u_azamat", { matchRule: "all" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call("POST", planPath(id, "/rule"), DEMO_USER_ID, { matchRule: "most" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const strict = await call<PlanView>(
      "POST",
      planPath(id, "/rule"),
      DEMO_USER_ID,
      { matchRule: "all" },
    );
    expect(strict.plan.matchRule).toBe("all");
    // Вторая стала «почти», а барабан крутится среди совпадений — голос за
    // неё снят.
    expect(decisionCandidates(strict.plan, strict.activities).pool).toEqual([
      first,
    ]);
    expect(strict.plan.votes).toEqual({ [DEMO_USER_ID]: first });
    const loose = await call<PlanView>(
      "POST",
      planPath(id, "/rule"),
      DEMO_USER_ID,
      { matchRule: "majority" },
    );
    expect(
      decisionCandidates(loose.plan, loose.activities).pool.sort(),
    ).toEqual([first, second].sort());
  });

  it("«Добавить ещё занятий»: в конец колоды, снова свайп, «закончил» сброшен", async () => {
    const view = await toResults({});
    const id = view.plan.id;
    const custom = await call<Activity>("POST", "/activities", DEMO_USER_ID, {
      title: "Шашлыки у Данияра на даче",
      pricePerPersonMax: 500,
    });
    const stranger = await newUser("Айжан");
    const foreign = await call<Activity>("POST", "/activities", stranger.id, {
      title: "Чужое",
    });
    const add = (userId: string, activityIds: string[]) =>
      call<PlanView>("POST", planPath(id, "/activities"), userId, {
        activityIds,
      });
    await expect(add("u_azamat", ["a_001"])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(add(DEMO_USER_ID, [foreign.id])).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(add(DEMO_USER_ID, ["a_999"])).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      add(DEMO_USER_ID, [view.plan.deck[0] ?? ""]),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(add(DEMO_USER_ID, [])).rejects.toMatchObject({
      code: "VALIDATION",
    });

    await vote(id, DEMO_USER_ID, view.plan.deck[0] ?? "");
    world.bus.events.length = 0;
    const added = await add(DEMO_USER_ID, [
      "a_001",
      view.plan.deck[0] ?? "",
      custom.id,
      "a_001",
    ]);
    expect(added.plan.deck).toEqual([...view.plan.deck, "a_001", custom.id]);
    expect(added.activities.map((a) => a.id)).toEqual(added.plan.deck);
    expect(added.plan.customActivityIds).toContain(custom.id);
    expect(added.plan.status).toBe("swiping");
    expect(added.plan.finishedIds).toEqual([]);
    expect(added.plan.votes).toEqual({});
    expect(eventsOf("trigger")).toEqual([
      expect.objectContaining({ name: "plan:started", id }),
    ]);
    // Свайпы старых карточек на месте — досвайпать только новые.
    let last = added;
    for (const userId of EVERYONE) {
      last = await swipe(id, userId, "a_001", "like");
      last = await swipe(id, userId, custom.id, "pass");
    }
    expect(last.plan.status).toBe("results");
    expect(decisionCandidates(last.plan, last.activities)).toEqual({
      pool: ["a_001"],
      source: "matches",
    });
    // После решения добавлять нельзя — сначала отменить его.
    await call("POST", planPath(id, "/decide"), DEMO_USER_ID, {
      method: "random",
    });
    await expect(add(DEMO_USER_ID, ["a_006"])).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });
});

const createDeadline = (participantIds = BOTS, deadline = NOW + 2 * DAY) =>
  call<PlanView>("POST", "/plans", DEMO_USER_ID, {
    title: "На выходных",
    mode: "deadline",
    deadline: new Date(deadline).toISOString(),
    participantIds,
    filters: FILTERS,
  });

const expire = () => call<{ expired: string[] }>("POST", "/plans/expire", null);

describe("дедлайн «До даты»", () => {
  it("до даты ничего не меняется, после — результаты, свайпы не принимаются", async () => {
    const view = await createDeadline();
    const live = await startLive("all");
    const id = view.plan.id;
    world.bus.events.length = 0;
    expect(await expire()).toEqual({ expired: [] });
    expect(world.bus.events).toEqual([]);

    world.clock.advance(2 * DAY);
    await expect(
      swipe(id, DEMO_USER_ID, view.plan.deck[0] ?? "", "like"),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(await expire()).toEqual({ expired: [id] });
    expect(eventsOf("db:changed")).toEqual([
      expect.objectContaining({ scope: ["plans"], id }),
    ]);
    const seen = await call<PlanView>("GET", planPath(id), DEMO_USER_ID);
    expect(seen.plan.status).toBe("results");
    // «Прямо сейчас» дедлайна не имеет — его проход не трогает.
    const liveSeen = await call<PlanView>(
      "GET",
      planPath(live.plan.id),
      DEMO_USER_ID,
    );
    expect(liveSeen.plan.status).toBe("swiping");
    expect(await expire()).toEqual({ expired: [] });
  });

  it("закончили все — проход тоже закрывает (старые данные)", async () => {
    const view = await createDeadline(["u_azamat"]);
    const id = view.plan.id;
    // Так план мог остаться после T14, где «До даты» ждал даты.
    await server.deps.db.write((db) => {
      const plan = db.plans[id];
      if (plan) plan.finishedIds = [DEMO_USER_ID, "u_azamat"];
    });
    expect(await expire()).toEqual({ expired: [id] });
  });

  it("новый круг после даты: +1 день или своя дата", async () => {
    const view = await createDeadline(["u_azamat"]);
    const id = view.plan.id;
    world.clock.advance(3 * DAY);
    await expire();
    const now = NOW + 3 * DAY;
    await expect(
      call("POST", planPath(id, "/activities"), DEMO_USER_ID, {
        activityIds: ["a_001"],
        deadline: new Date(now - 1_000).toISOString(),
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const added = await call<PlanView>(
      "POST",
      planPath(id, "/activities"),
      DEMO_USER_ID,
      { activityIds: ["a_001"] },
    );
    expect(added.plan.status).toBe("swiping");
    expect(added.plan.deadline).toBe(new Date(now + DAY).toISOString());
    expect(await expire()).toEqual({ expired: [] });
  });
});

describe("боты после результатов и «До даты»", () => {
  const startBots = () => {
    const manual = createManualScheduler();
    const engine = createDefaultBotEngine({
      clock: server.deps.clock,
      db: server.deps.db,
      handle: (request) => server.handle(request),
      publish: world.bus.publish,
      random: createSeededRandom("bots"),
      scheduler: manual.scheduler,
      settings: world.settings,
      subscribe: world.bus.subscribe,
    });
    engine.start();
    return { engine, manual };
  };

  it("«До даты»: неспешно проходят колоду, после даты — стоп", async () => {
    const { engine, manual } = startBots();
    const view = await createDeadline();
    const id = view.plan.id;
    await tick();
    // Первая карточка — через 5–30 с × темп бота (0.7–1.4).
    expect(manual.tasks).toHaveLength(3);
    for (const { ms } of manual.tasks) {
      expect(ms).toBeGreaterThanOrEqual(5_000 * 0.7);
      expect(ms).toBeLessThanOrEqual(30_000 * 1.4);
    }
    await manual.runAll();
    // Дальше — 4–15 с на карточку.
    expect(manual.tasks).toHaveLength(3);
    for (const { ms } of manual.tasks) {
      expect(ms).toBeGreaterThanOrEqual(4_000 * 0.7);
      expect(ms).toBeLessThanOrEqual(15_000 * 1.4);
    }
    const mid = await call<PlanView>("GET", planPath(id), DEMO_USER_ID);
    for (const bot of BOTS) {
      expect(Object.keys(mid.plan.swipes[bot] ?? {})).toHaveLength(1);
    }
    // Перемотали за дату — проход закрывает план с тем, что успели.
    world.clock.advance(2 * DAY);
    await expire();
    await manual.drain();
    const after = await call<PlanView>("GET", planPath(id), DEMO_USER_ID);
    expect(after.plan.status).toBe("results");
    expect(after.plan.swipes).toEqual(mid.plan.swipes);
    expect(manual.tasks).toHaveLength(0);
    engine.stop();
  });

  it("«До даты»: боты досвайпали, человек тоже — результаты без даты", async () => {
    const { engine, manual } = startBots();
    const view = await createDeadline();
    await tick();
    await manual.drain();
    const mid = await call<PlanView>(
      "GET",
      planPath(view.plan.id),
      DEMO_USER_ID,
    );
    expect(new Set(mid.plan.finishedIds)).toEqual(new Set(BOTS));
    expect(mid.plan.status).toBe("swiping");
    const done = await playDeck(view, { [DEMO_USER_ID]: "L" }, [DEMO_USER_ID]);
    expect(done.plan.status).toBe("results");
    engine.stop();
  });

  it("«Добавить ещё занятий»: боты досвайпывают новые, без двойных цепочек", async () => {
    const { engine, manual } = startBots();
    const started = await startLive("all");
    const id = started.plan.id;
    await tick();
    await manual.drain();
    await playDeck(started, {}, [DEMO_USER_ID]);
    world.bus.events.length = 0;
    const added = await call<PlanView>(
      "POST",
      planPath(id, "/activities"),
      DEMO_USER_ID,
      { activityIds: ["a_001", "a_006"] },
    );
    expect(added.plan.status).toBe("swiping");
    await tick();
    expect(manual.tasks).toHaveLength(3);
    // Повторный plan:started посреди колоды не удваивает бота.
    world.bus.publish({
      type: "trigger",
      name: "plan:started",
      id,
      by: DEMO_USER_ID,
    });
    await tick();
    expect(manual.tasks).toHaveLength(6);
    await manual.drain();
    for (const bot of BOTS) {
      const progress = eventsOf("plan:progress").filter(
        (event) => event.userId === bot,
      );
      expect(progress.map((event) => event.done)).toEqual([6, 7]);
    }
    const seen = await call<PlanView>("GET", planPath(id), DEMO_USER_ID);
    expect(new Set(seen.plan.finishedIds)).toEqual(new Set(BOTS));
    let last = seen;
    for (const card of ["a_001", "a_006"]) {
      last = await swipe(id, DEMO_USER_ID, card, "pass");
    }
    expect(last.plan.status).toBe("results");
    engine.stop();
  });
});

describe("«Показать итоги сейчас» (auto-tasks P04)", () => {
  const close = (id: string, userId: string) =>
    call<PlanView>("POST", planPath(id, "/close"), userId);
  const codeOf = (promise: Promise<unknown>) =>
    promise.then(
      () => "ok",
      (error: { code?: string }) => error.code,
    );

  it("не организатор — FORBIDDEN; долистал меньше двух — CONFLICT", async () => {
    const view = await startLive("all");
    expect(await codeOf(close(view.plan.id, "u_azamat"))).toBe("FORBIDDEN");
    await playDeck(view, {}, [DEMO_USER_ID]);
    expect(await codeOf(close(view.plan.id, DEMO_USER_ID))).toBe("CONFLICT");
  });

  it("после close «Все за» считается среди долиставших; повтор ничего не меняет", async () => {
    const view = await startLive("all");
    // Айгерим и Азамат лайкнули первую карточку, Нурай тоже, Данияр бросил.
    await playDeck(view, { [DEMO_USER_ID]: "L", u_azamat: "L", u_nurai: "L" }, [
      DEMO_USER_ID,
      "u_azamat",
      "u_nurai",
    ]);
    const closed = await close(view.plan.id, DEMO_USER_ID);
    expect(closed.plan).toMatchObject({ status: "results", closedEarly: true });
    const first = view.plan.deck[0];
    const { matches } = computeMatches(closed.plan);
    expect(matches.map((m) => m.activityId)).toEqual([first]);
    const again = await close(view.plan.id, DEMO_USER_ID);
    expect(again.plan).toEqual(closed.plan);
    // Недолиставший видит итоги: колода закрыта.
    const forDaniyar = await call<PlanView>(
      "GET",
      planPath(view.plan.id),
      "u_daniyar",
    );
    expect(forDaniyar.plan.status).toBe("results");
  });
});

describe("дата «До даты» и отстающие (auto-tasks-ux-5 Y02)", () => {
  const TRIO = ["u_azamat", "u_nurai"];
  const extend = (id: string, userId: string) =>
    call<PlanView>("POST", planPath(id, "/extend"), userId);
  const codeOf = (promise: Promise<unknown>) =>
    promise.then(
      () => "ok",
      (error: { code?: string }) => error.code,
    );
  // «До даты» на троих: finished долистали (лайк первой карточки), у
  // остальных — пас первой.
  const deadlinePlan = async (finished: string[]) => {
    const view = await createDeadline(TRIO);
    const id = view.plan.id;
    const first = view.plan.deck[0] ?? "";
    await playDeck(
      view,
      Object.fromEntries(finished.map((userId) => [userId, "L"])),
      finished,
    );
    for (const userId of view.plan.participantIds) {
      if (!finished.includes(userId)) await swipe(id, userId, first, "pass");
    }
    return { id, first, deck: view.plan.deck };
  };
  const pastDeadline = () => {
    world.clock.advance(2 * DAY + 60_000);
    return expire();
  };
  const read = (id: string, userId = DEMO_USER_ID) =>
    call<PlanView>("GET", planPath(id), userId);

  it("1 из 3: closedEarly и timedOut, итогов нет", async () => {
    const { id } = await deadlinePlan([DEMO_USER_ID]);
    expect(await pastDeadline()).toEqual({ expired: [id] });
    const { plan } = await read(id);
    expect(plan).toMatchObject({
      status: "results",
      closedEarly: true,
      timedOut: true,
    });
    expect(isTimedOutWithoutResults(plan)).toBe(true);
  });

  it("2 из 3: итоги по долиставшим", async () => {
    const { id, first } = await deadlinePlan([DEMO_USER_ID, "u_azamat"]);
    expect(await pastDeadline()).toEqual({ expired: [id] });
    const { plan } = await read(id, "u_nurai");
    expect(plan).toMatchObject({ closedEarly: true, timedOut: true });
    expect(isTimedOutWithoutResults(plan)).toBe(false);
    expect(computeMatches(plan).matches.map((m) => m.activityId)).toEqual([
      first,
    ]);
  });

  it("3 из 3: итоги без отметок, дата их не трогает", async () => {
    const { id } = await deadlinePlan([DEMO_USER_ID, ...TRIO]);
    expect(await pastDeadline()).toEqual({ expired: [] });
    const { plan } = await read(id);
    expect(plan.status).toBe("results");
    expect(plan.closedEarly).toBeUndefined();
    expect(plan.timedOut).toBeUndefined();
  });

  it("«Продлить на сутки»: снова колода, боты зовутся, повтор ничего не меняет", async () => {
    const { id } = await deadlinePlan([DEMO_USER_ID]);
    await pastDeadline();
    const now = NOW + 2 * DAY + 60_000;
    expect(await codeOf(extend(id, "u_azamat"))).toBe("FORBIDDEN");
    world.bus.events.length = 0;
    const extended = await extend(id, DEMO_USER_ID);
    expect(extended.plan).toMatchObject({
      status: "swiping",
      deadline: new Date(now + DAY).toISOString(),
      finishedIds: [DEMO_USER_ID],
    });
    expect(extended.plan.closedEarly).toBeUndefined();
    expect(extended.plan.timedOut).toBeUndefined();
    expect(eventsOf("trigger")).toEqual([
      expect.objectContaining({ name: "plan:started", id }),
    ]);
    const again = await extend(id, DEMO_USER_ID);
    expect(again.plan).toEqual(extended.plan);
    expect(await expire()).toEqual({ expired: [] });
  });

  it("«Продлить» нельзя, если итоги без отстающих или план «Прямо сейчас»", async () => {
    const { id } = await deadlinePlan([DEMO_USER_ID, ...TRIO]);
    expect(await codeOf(extend(id, DEMO_USER_ID))).toBe("CONFLICT");
    const live = await startLive("all");
    expect(await codeOf(extend(live.plan.id, DEMO_USER_ID))).toBe("CONFLICT");
  });
});
