import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, expect, it } from "vitest";

import type { RealtimeEvent } from "@/shared/lib/realtime/types";

import type { CatalogMeta } from "../catalog/types";
import type { SantaSummary, SantaTickResult, SantaView } from "../santa/types";
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

// Тайный Санта: создание, вступление, правка, жеребьёвка (вручную и по
// дате), приватность пар, конверт и «Купил», боты.
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
const HOUR = 3600_000;
// У Тимура и Бекзата в сиде вишлиста нет — они его «собирают».
const BOTS = ["u_azamat", "u_nurai", "u_daniyar", "u_timur", "u_bekzat"];
const WITHOUT_WISHLIST = ["u_timur", "u_bekzat"];

const GAME = {
  title: "Офис, Новый год",
  budget: 2000,
  exchangeDate: "2026-12-28",
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
    await new Promise((resolve) => setTimeout(resolve, 50));
  };
  return { scheduler, tasks, runAll };
};

let server: MockServer;
let bus: ReturnType<typeof createBus>;
let settings: SettingsAccess;
let clock: ReturnType<typeof createFixedClock>;
let db: ReturnType<typeof createMemoryDb>;

const call = <T>(
  method: "GET" | "PATCH" | "POST",
  path: string,
  userId: null | string,
  body?: unknown,
) => server.handle({ method, path, userId, body }) as Promise<T>;

const gamePath = (id: string, action = "") =>
  `/santa/${encodeURIComponent(id)}${action}`;

const createGame = (extra: Record<string, unknown> = {}) =>
  call<SantaView>("POST", "/santa", DEMO_USER_ID, {
    ...GAME,
    participantIds: BOTS,
    ...extra,
  });

const joinAll = async (id: string, ids = BOTS) => {
  let view: SantaView | undefined;
  for (const userId of ids) {
    view = await call<SantaView>("POST", gamePath(id, "/join"), userId);
  }
  return view;
};

const drawnGame = async () => {
  const created = await createGame();
  await joinAll(created.game.id);
  return call<SantaView>(
    "POST",
    gamePath(created.game.id, "/draw"),
    DEMO_USER_ID,
  );
};

const newUser = (name: string) =>
  call<User>("POST", "/users", null, {
    name,
    avatarColor: "mint",
    interests: [],
    audience: "female",
  });

const triggers = (name: string) =>
  bus.events.filter((event) => event.type === "trigger" && event.name === name);

const reports = () =>
  bus.events.flatMap((event) =>
    event.type === "bot:action" ? [event.text] : [],
  );

const tick = () => new Promise((resolve) => setTimeout(resolve, 20));

beforeEach(async () => {
  clock = createFixedClock(NOW);
  bus = createBus();
  settings = createMemorySettings();
  db = createMemoryDb(async () => createSeedDb({ products, now: clock.now() }));
  server = createMockServer({
    catalog: createMemoryCatalog(products, activities, meta),
    clock,
    db,
    realtime: bus,
    random: createSeededRandom("santa"),
    settings,
  });
  await call("POST", "/auth/demo", null);
});

describe("создание игры", () => {
  it("организатор вступил, друзья позваны, статусы вишлиста, события", async () => {
    const view = await createGame({ exclusions: [["u_azamat", "u_nurai"]] });
    expect(view.game).toMatchObject({
      ...GAME,
      ownerId: DEMO_USER_ID,
      status: "gathering",
      participantIds: [DEMO_USER_ID],
      invitedIds: BOTS,
      exclusions: [["u_azamat", "u_nurai"]],
    });
    expect(view.game.drawAt).toBeUndefined();
    expect(view.game.id.startsWith("sg_")).toBe(true);
    expect(view.role).toBe("owner");
    expect(view.me).toEqual({ envelope: "sealed", bought: false, ward: null });
    expect(view.members.map((m) => [m.name, m.joined, m.hasWishlist])).toEqual([
      ["Айгерим", true, true],
      ["Азамат", false, true],
      ["Нурай", false, true],
      ["Данияр", false, true],
      ["Тимур", false, false],
      ["Бекзат", false, false],
    ]);
    // Пока вступил один организатор — провести нельзя.
    expect(view.drawIssue).toBe(
      "Нужно хотя бы 3 участника — позови ещё друзей",
    );
    expect(triggers("santa:created")).toEqual([
      expect.objectContaining({ id: view.game.id, by: DEMO_USER_ID }),
    ]);
    expect(
      bus.events.some(
        (event) =>
          event.type === "db:changed" &&
          event.scope.includes("santa") &&
          event.id === view.game.id,
      ),
    ).toBe(true);
  });

  it("жеребьёвка по дате: drawAt сохраняется", async () => {
    const drawAt = new Date(NOW + 24 * HOUR).toISOString();
    const view = await createGame({ drawMode: "date", drawAt });
    expect(view.game.drawAt).toBe(drawAt);
  });

  it("ошибки ввода: не друг, даты, исключения", async () => {
    const stranger = await newUser("Бакыт");
    const other = await newUser("Бермет");
    // Новички дружат только с демо-ботами, не друг с другом.
    await expect(
      call("POST", "/santa", stranger.id, {
        ...GAME,
        participantIds: [other.id],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Позвать можно только друзей — остальным отправь ссылку",
    });
    await expect(
      createGame({ exchangeDate: "2026-11-01" }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Дата обмена уже прошла",
    });
    await expect(createGame({ drawMode: "date" })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Выбери дату жеребьёвки",
    });
    await expect(
      createGame({
        drawMode: "date",
        drawAt: new Date(NOW - HOUR).toISOString(),
      }),
    ).rejects.toMatchObject({ message: "Дата жеребьёвки уже прошла" });
    await expect(
      createGame({
        drawMode: "date",
        drawAt: new Date(2027, 0, 5).toISOString(),
      }),
    ).rejects.toMatchObject({
      message: "Жеребьёвка должна пройти до обмена подарками",
    });
    await expect(
      createGame({ exclusions: [["u_azamat", stranger.id]] }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "В исключениях — тот, кого нет в игре",
    });
    await expect(createGame({ budget: 0 })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "Укажи бюджет",
    });
  });

  it("невозможные исключения — понятная ошибка сразу, до жеребьёвки", async () => {
    await expect(
      createGame({
        participantIds: ["u_azamat", "u_nurai"],
        exclusions: [
          ["u_azamat", DEMO_USER_ID],
          ["u_nurai", "u_azamat"],
        ],
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Слишком много исключений: Азамату некому дарить",
    });
  });
});

describe("вступление и список", () => {
  it("позванный вступает, чужой — по ссылке, повтор ничего не меняет", async () => {
    const { game } = await createGame();
    const joined = await call<SantaView>(
      "POST",
      gamePath(game.id, "/join"),
      "u_azamat",
    );
    expect(joined.role).toBe("participant");
    expect(joined.game.participantIds).toEqual([DEMO_USER_ID, "u_azamat"]);
    expect(joined.game.invitedIds).not.toContain("u_azamat");
    expect(joined.me?.envelope).toBe("sealed");

    const guest = await newUser("Бакыт");
    const before = await call<SantaView>("GET", gamePath(game.id), guest.id);
    expect(before.role).toBe("guest");
    expect(before.me).toBeNull();
    const viaLink = await call<SantaView>(
      "POST",
      gamePath(game.id, "/join"),
      guest.id,
    );
    expect(viaLink.game.participantIds).toContain(guest.id);

    bus.events.length = 0;
    await call("POST", gamePath(game.id, "/join"), guest.id);
    expect(bus.events).toHaveLength(0);
  });

  it("GET /santa — у организатора и позванного, новые сверху", async () => {
    const first = await createGame({ title: "Первая" });
    clock.advance(1000);
    const second = await createGame({ title: "Вторая" });
    const mine = await call<SantaSummary[]>("GET", "/santa", DEMO_USER_ID);
    expect(mine.map((s) => s.game.id)).toEqual([second.game.id, first.game.id]);
    const invited = await call<SantaSummary[]>("GET", "/santa", "u_nurai");
    expect(invited.map((s) => s.role)).toEqual(["invited", "invited"]);
    expect(invited[0]?.me).toBeNull();
    const stranger = await newUser("Бакыт");
    expect(await call("GET", "/santa", stranger.id)).toEqual([]);
  });

  it("неизвестная игра — NOT_FOUND; после жеребьёвки вступить нельзя", async () => {
    await expect(
      call("GET", gamePath("sg_nope"), DEMO_USER_ID),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const drawn = await drawnGame();
    const late = await newUser("Бакыт");
    await expect(
      call("POST", gamePath(drawn.game.id, "/join"), late.id),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Жеребьёвка уже прошла — вступить нельзя",
    });
  });
});

describe("правка до жеребьёвки", () => {
  it("только организатор, бюджет, название, даты и исключения", async () => {
    const { game } = await createGame();
    await joinAll(game.id, ["u_azamat"]);
    await expect(
      call("PATCH", gamePath(game.id), "u_azamat", { budget: 5000 }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Менять игру может только организатор",
    });
    const drawAt = new Date(NOW + 2 * HOUR).toISOString();
    const patched = await call<SantaView>(
      "PATCH",
      gamePath(game.id),
      DEMO_USER_ID,
      {
        title: "Офис",
        budget: 3000,
        exchangeDate: "2026-12-30",
        drawMode: "date",
        drawAt,
        exclusions: [
          ["u_daniyar", "u_timur"],
          ["u_timur", "u_daniyar"],
        ],
      },
    );
    expect(patched.game).toMatchObject({
      title: "Офис",
      budget: 3000,
      exchangeDate: "2026-12-30",
      drawAt,
      // Повтор пары в обратную сторону — одна пара.
      exclusions: [["u_daniyar", "u_timur"]],
    });
    const manual = await call<SantaView>(
      "PATCH",
      gamePath(game.id),
      DEMO_USER_ID,
      { drawMode: "manual" },
    );
    expect(manual.game.drawAt).toBeUndefined();
    await expect(
      call("PATCH", gamePath(game.id), DEMO_USER_ID, {
        exclusions: [
          ["u_azamat", DEMO_USER_ID],
          ["u_azamat", "u_nurai"],
          ["u_azamat", "u_daniyar"],
          ["u_azamat", "u_timur"],
          ["u_azamat", "u_bekzat"],
        ],
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Слишком много исключений: Азамату некому дарить",
    });
  });

  it("после жеребьёвки менять нельзя", async () => {
    const drawn = await drawnGame();
    await expect(
      call("PATCH", gamePath(drawn.game.id), DEMO_USER_ID, { budget: 1000 }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Жеребьёвка уже прошла — менять игру нельзя",
    });
  });
});

describe("жеребьёвка", () => {
  it("только организатор и когда вступили хотя бы трое", async () => {
    const { game } = await createGame();
    await joinAll(game.id, ["u_azamat"]);
    await expect(
      call("POST", gamePath(game.id, "/draw"), "u_azamat"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Жеребьёвку проводит организатор",
    });
    await expect(
      call("POST", gamePath(game.id, "/draw"), DEMO_USER_ID),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Нужно хотя бы 3 участника — позови ещё друзей",
    });
    // Ошибка ничего не записала.
    expect(db.snapshot()?.santaGames[game.id]?.status).toBe("gathering");
  });

  it("исключения среди вступивших не сходятся — CONFLICT, drawIssue заранее", async () => {
    // Все шестеро — пары сходятся, а из вступивших троих — нет.
    const { game } = await createGame({
      exclusions: [["u_azamat", "u_nurai"]],
    });
    const view = await joinAll(game.id, ["u_azamat", "u_nurai"]);
    expect(view?.drawIssue).toMatch(
      /^Слишком много исключений: (Айгерим|Азамату|Нурай) некому дарить$/,
    );
    await expect(
      call("POST", gamePath(game.id, "/draw"), DEMO_USER_ID),
    ).rejects.toMatchObject({ code: "CONFLICT", message: view?.drawIssue });
  });

  it("у каждого ровно один подопечный, себе никто не дарит, позванные выбывают", async () => {
    const { game } = await createGame();
    // Бекзат так и не вступил.
    await joinAll(game.id, ["u_azamat", "u_nurai", "u_daniyar", "u_timur"]);
    bus.events.length = 0;
    const view = await call<SantaView>(
      "POST",
      gamePath(game.id, "/draw"),
      DEMO_USER_ID,
    );
    expect(view.game.status).toBe("drawn");
    expect(view.game.drawnAt).toBe(new Date(NOW).toISOString());
    expect(view.game.invitedIds).toEqual([]);
    expect(view.members.map((m) => m.id)).not.toContain("u_bekzat");
    expect(view.drawIssue).toBeNull();
    const stored = db.snapshot()?.santaGames[game.id];
    const ids = [DEMO_USER_ID, "u_azamat", "u_nurai", "u_daniyar", "u_timur"];
    expect(Object.keys(stored?.assignments ?? {}).sort()).toEqual(
      [...ids].sort(),
    );
    expect(Object.values(stored?.assignments ?? {}).sort()).toEqual(
      [...ids].sort(),
    );
    for (const [santa, ward] of Object.entries(stored?.assignments ?? {})) {
      expect(ward).not.toBe(santa);
    }
    expect(triggers("santa:drawn")).toEqual([
      expect.objectContaining({ id: game.id, by: DEMO_USER_ID }),
    ]);
    await expect(
      call("POST", gamePath(game.id, "/draw"), DEMO_USER_ID),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("приватность пар", () => {
  it("каждый видит только своего подопечного, пар в ответах нет", async () => {
    const drawn = await drawnGame();
    const id = drawn.game.id;
    const assignments = db.snapshot()?.santaGames[id]?.assignments ?? {};
    for (const userId of [DEMO_USER_ID, ...BOTS]) {
      const view = await call<SantaView>("GET", gamePath(id), userId);
      expect(view.me?.ward?.id).toBe(assignments[userId]);
      expect(view.game).not.toHaveProperty("assignments");
      expect(view.game).not.toHaveProperty("openedIds");
      expect(view.game).not.toHaveProperty("boughtIds");
      const json = JSON.stringify(view);
      expect(json).not.toContain("assignments");
      // Кому дарят другие — нигде: кроме своего подопечного, о парах нет
      // ни слова (участники — без поля «подопечный»).
      expect(view.members.every((m) => !("ward" in m))).toBe(true);
    }
    // Чужой — без пары вовсе.
    const stranger = await newUser("Бакыт");
    const outside = await call<SantaView>("GET", gamePath(id), stranger.id);
    expect(outside.me).toBeNull();
    expect(JSON.stringify(outside)).not.toContain("assignments");
  });

  it("в списке подопечный — только после вскрытия конверта", async () => {
    const drawn = await drawnGame();
    const id = drawn.game.id;
    const before = await call<SantaSummary[]>("GET", "/santa", DEMO_USER_ID);
    expect(before[0]?.me).toEqual({
      envelope: "ready",
      bought: false,
      ward: null,
    });
    await call("POST", gamePath(id, "/open"), DEMO_USER_ID);
    const after = await call<SantaSummary[]>("GET", "/santa", DEMO_USER_ID);
    expect(after[0]?.me?.envelope).toBe("opened");
    expect(after[0]?.me?.ward?.id).toBe(drawn.me?.ward?.id);
    // Вишлиста подопечного в списке нет — только профиль.
    expect(after[0]?.me?.ward).not.toHaveProperty("wishlist");
  });
});

describe("конверт и «Я купил подарок»", () => {
  it("до жеребьёвки и не участнику — нельзя", async () => {
    const { game } = await createGame();
    await expect(
      call("POST", gamePath(game.id, "/open"), DEMO_USER_ID),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Жеребьёвки ещё не было",
    });
    const drawn = await drawnGame();
    const stranger = await newUser("Бакыт");
    await expect(
      call("POST", gamePath(drawn.game.id, "/open"), stranger.id),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      call("POST", gamePath(drawn.game.id, "/bought"), DEMO_USER_ID),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Сначала открой конверт",
    });
  });

  it("вскрытие сохраняется, «Купил» — счётчик у всех, можно снять", async () => {
    const drawn = await drawnGame();
    const id = drawn.game.id;
    expect(drawn.me?.envelope).toBe("ready");
    const opened = await call<SantaView>(
      "POST",
      gamePath(id, "/open"),
      DEMO_USER_ID,
    );
    expect(opened.me?.envelope).toBe("opened");
    expect(opened.openedCount).toBe(1);
    bus.events.length = 0;
    await call("POST", gamePath(id, "/open"), DEMO_USER_ID);
    expect(bus.events).toHaveLength(0);
    const again = await call<SantaView>("GET", gamePath(id), DEMO_USER_ID);
    expect(again.me?.envelope).toBe("opened");

    const bought = await call<SantaView>(
      "POST",
      gamePath(id, "/bought"),
      DEMO_USER_ID,
    );
    expect(bought.me?.bought).toBe(true);
    expect(bought.boughtCount).toBe(1);
    // Другие видят только количество.
    const other = await call<SantaView>("GET", gamePath(id), "u_azamat");
    expect(other.boughtCount).toBe(1);
    expect(other.me?.bought).toBe(false);
    const undone = await call<SantaView>(
      "POST",
      gamePath(id, "/bought"),
      DEMO_USER_ID,
      { bought: false },
    );
    expect(undone.me?.bought).toBe(false);
    expect(undone.boughtCount).toBe(0);
  });

  it("вишлист подопечного: активные желания с ценами и «Дороже бюджета»", async () => {
    const created = await createGame({ budget: 1500 });
    await joinAll(created.game.id);
    const drawn = await call<SantaView>(
      "POST",
      gamePath(created.game.id, "/draw"),
      DEMO_USER_ID,
    );
    const ward = drawn.me?.ward;
    expect(ward).toBeTruthy();
    const items = db.snapshot()?.wishlistItems[ward?.id ?? ""] ?? [];
    const active = items.filter((item) => item.status === "active");
    expect(ward?.wishlist).toHaveLength(active.length);
    const byId = new Map(products.map((p) => [p.id, p]));
    for (const item of ward?.wishlist ?? []) {
      const product = byId.get(item.productId ?? "");
      expect(item.priceMin).toBe(product?.priceMin ?? null);
      expect(item.overBudget).toBe(
        item.priceMin !== null && item.priceMin > 1500,
      );
    }
    expect(ward?.overBudgetCount).toBe(
      ward?.wishlist.filter((item) => item.overBudget).length,
    );
  });
});

describe("жеребьёвка по дате (POST /santa/tick)", () => {
  it("до даты — ничего, дата наступила — жеребьёвка, повтор — ничего", async () => {
    const drawAt = new Date(NOW + HOUR).toISOString();
    const { game } = await createGame({ drawMode: "date", drawAt });
    await joinAll(game.id);
    expect(await call<SantaTickResult>("POST", "/santa/tick", null)).toEqual({
      drawn: [],
      failed: [],
    });
    clock.advance(2 * HOUR);
    bus.events.length = 0;
    const result = await call<SantaTickResult>("POST", "/santa/tick", null);
    expect(result).toEqual({ drawn: [game.id], failed: [] });
    expect(db.snapshot()?.santaGames[game.id]?.status).toBe("drawn");
    expect(triggers("santa:drawn")).toHaveLength(1);
    expect(await call<SantaTickResult>("POST", "/santa/tick", null)).toEqual({
      drawn: [],
      failed: [],
    });
  });

  it("провести нельзя — игра ждёт организатора, ничего не записано", async () => {
    const drawAt = new Date(NOW + HOUR).toISOString();
    const { game } = await createGame({ drawMode: "date", drawAt });
    await joinAll(game.id, ["u_azamat"]);
    clock.advance(2 * HOUR);
    const before = structuredClone(db.snapshot()?.santaGames[game.id]);
    const result = await call<SantaTickResult>("POST", "/santa/tick", null);
    expect(result).toEqual({
      drawn: [],
      failed: [
        {
          id: game.id,
          reason: "Нужно хотя бы 3 участника — позови ещё друзей",
        },
      ],
    });
    expect(db.snapshot()?.santaGames[game.id]).toEqual(before);
    // Организатор может провести вручную, когда вступят остальные.
    await joinAll(game.id, ["u_nurai"]);
    const view = await call<SantaView>(
      "POST",
      gamePath(game.id, "/draw"),
      DEMO_USER_ID,
    );
    expect(view.game.status).toBe("drawn");
  });
});

describe("боты в Санте", () => {
  const startBots = () => {
    const manual = createManualScheduler();
    const engine = createDefaultBotEngine({
      clock: server.deps.clock,
      db: server.deps.db,
      handle: (request) => server.handle(request),
      publish: bus.publish,
      random: createSeededRandom("santa-bots"),
      scheduler: manual.scheduler,
      settings,
      subscribe: bus.subscribe,
    });
    engine.start();
    return { engine, manual };
  };

  it("5 ботов вступают за ~10 с, двое без вишлиста собирают его", async () => {
    const { engine, manual } = startBots();
    const { game } = await createGame();
    await tick();
    expect(manual.tasks).toHaveLength(5);
    // «Нормально»: 2–10 с × темп бота (0.7–1.4).
    for (const { ms } of manual.tasks) {
      expect(ms).toBeGreaterThanOrEqual(2_000 * 0.7);
      expect(ms).toBeLessThanOrEqual(10_000 * 1.4);
    }
    await manual.runAll();
    const joined = await call<SantaView>(
      "GET",
      gamePath(game.id),
      DEMO_USER_ID,
    );
    expect(joined.members.every((m) => m.joined)).toBe(true);
    expect(joined.drawIssue).toBeNull();
    expect(reports()).toContain("Азамат вступил в «Офис, Новый год»");
    expect(reports()).toContain("Нурай вступила в «Офис, Новый год»");
    const statuses = () =>
      Object.fromEntries(joined.members.map((m) => [m.id, m.hasWishlist]));
    expect(WITHOUT_WISHLIST.map((id) => statuses()[id])).toEqual([
      false,
      false,
    ]);

    // Собирают только те, у кого вишлиста не было: 20–60 с × темп.
    expect(manual.tasks).toHaveLength(2);
    for (const { ms } of manual.tasks) {
      expect(ms).toBeGreaterThanOrEqual(20_000 * 0.7);
      expect(ms).toBeLessThanOrEqual(60_000 * 1.4);
    }
    await manual.runAll();
    const ready = await call<SantaView>("GET", gamePath(game.id), DEMO_USER_ID);
    expect(ready.members.every((m) => m.hasWishlist)).toBe(true);
    expect(reports()).toContain("Тимур собрал вишлист");
    expect(reports()).toContain("Бекзат собрал вишлист");
    // Собранный вишлист — настоящий: 5–8 «Хочу», шеринг открыт.
    const snapshot = db.snapshot();
    for (const id of WITHOUT_WISHLIST) {
      const count = snapshot?.wishlistItems[id]?.length ?? 0;
      expect(count).toBeGreaterThanOrEqual(5);
      expect(count).toBeLessThanOrEqual(8);
      expect(snapshot?.wishlistMeta[id]?.shareUnlockedAt).toBeTruthy();
    }
    expect(manual.tasks).toHaveLength(0);
    engine.stop();
  });

  it("после жеребьёвки боты вскрывают конверты и отмечают «Купил»", async () => {
    const { engine, manual } = startBots();
    const { game } = await createGame();
    await tick();
    await manual.runAll();
    // Сбор вишлистов — не мешает.
    await manual.runAll();
    bus.events.length = 0;
    await call("POST", gamePath(game.id, "/draw"), DEMO_USER_ID);
    await tick();
    expect(manual.tasks).toHaveLength(5);
    // Вскрыть — в течение минуты (× темп).
    for (const { ms } of manual.tasks) {
      expect(ms).toBeLessThanOrEqual(60_000 * 1.4);
    }
    await manual.runAll();
    const opened = await call<SantaView>(
      "GET",
      gamePath(game.id),
      DEMO_USER_ID,
    );
    expect(opened.openedCount).toBe(5);
    expect(opened.boughtCount).toBe(0);
    expect(manual.tasks).toHaveLength(5);
    for (const { ms } of manual.tasks) {
      expect(ms).toBeGreaterThanOrEqual(30_000 * 0.7);
      expect(ms).toBeLessThanOrEqual(120_000 * 1.4);
    }
    await manual.runAll();
    const bought = await call<SantaView>(
      "GET",
      gamePath(game.id),
      DEMO_USER_ID,
    );
    expect(bought.boughtCount).toBe(5);
    expect(bought.me?.bought).toBe(false);
    expect(reports()).toContain("Данияр купил подарок в «Офис, Новый год»");
    expect(reports()).toContain("Нурай купила подарок в «Офис, Новый год»");
    // В ленте — ни слова о том, кому.
    expect(reports()).toHaveLength(5);
    engine.stop();
  });

  it("жеребьёвка по дате тоже будит ботов", async () => {
    const { engine, manual } = startBots();
    const drawAt = new Date(NOW + HOUR).toISOString();
    const { game } = await createGame({ drawMode: "date", drawAt });
    await tick();
    await manual.runAll();
    await manual.runAll();
    clock.advance(2 * HOUR);
    await call("POST", "/santa/tick", null);
    await tick();
    expect(manual.tasks).toHaveLength(5);
    await manual.runAll();
    const view = await call<SantaView>("GET", gamePath(game.id), DEMO_USER_ID);
    expect(view.openedCount).toBe(5);
    engine.stop();
  });

  it("«Выкл» — боты не вступают", async () => {
    const { engine, manual } = startBots();
    settings.update({ botSpeed: "off" });
    await createGame();
    await tick();
    expect(manual.tasks).toHaveLength(0);
    engine.stop();
  });
});
