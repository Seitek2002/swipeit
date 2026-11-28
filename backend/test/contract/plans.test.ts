import type { Activity } from "@swipeit/core/api/catalog/types";
import type { PlanSummary, PlanView } from "@swipeit/core/api/plans/types";
import { computeMatches } from "@swipeit/core/logic/matches";
import type { RealtimeEvent } from "@swipeit/core/realtime/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ApiClient, type Caller, CLIENTS, NOW } from "./client";

// Контрактный тест «Че делать будем?» (BACKEND.md B10) — по plans.test.ts
// мока: создание, список, лобби, старт, свайп колоды и совпадения, «До
// даты», «Показать итоги сейчас». Ботов нет: всё делают 2–3 человека сами,
// только через API. Каталог — настоящий (catalog/activities.json), id
// занятий берём из ответов. Даты сравниваем через Date.parse: сервер отдаёт
// toISOString(), мок может хранить строку из запроса.
const DAY = 24 * 3600_000;

// Культура до 200 сом на человека — короткая колода из нескольких занятий.
const FILTERS = {
  categories: ["culture"],
  budgetPerPerson: { min: 0, max: 200 },
};
// Без фильтров — весь каталог (X05: короткая колода «Прямо сейчас»).
const NO_FILTERS = {
  categories: [],
  budgetPerPerson: { min: 0, max: null },
};
// Под это нет ни одного занятия: вечеринки до 100 сом.
const EMPTY_FILTERS = {
  categories: ["party"],
  budgetPerPerson: { min: 0, max: 100 },
};

const STATUS = {
  CONFLICT: 409,
  FORBIDDEN: 403,
  NAME_REQUIRED: 409,
  NOT_FOUND: 404,
  VALIDATION: 400,
} as const;

type PlanMatchEvent = Extract<RealtimeEvent, { type: "plan:match" }>;

const sorted = (ids: readonly string[]) => [...ids].sort();

describe.each(CLIENTS)("«Че делать будем?» — %s", (_name, create) => {
  let api: ApiClient;
  beforeEach(async () => {
    api = await create();
  });
  afterEach(() => api.close());

  const fails = (promise: Promise<unknown>, code: keyof typeof STATUS) =>
    expect(promise).rejects.toMatchObject({ code, status: STATUS[code] });

  const person = async (name: string) => {
    const { caller } = await api.newUser();
    await api.call(caller, "PATCH", "/me", { name });
    return caller;
  };
  // Организатор и двое его друзей.
  const trio = async () => {
    const owner = await person("Айгерим");
    const azamat = await person("Азамат");
    const nurai = await person("Нурай");
    await api.befriend(owner, azamat);
    await api.befriend(owner, nurai);
    return { owner, azamat, nurai };
  };
  const createPlan = (owner: Caller, body: Record<string, unknown> = {}) =>
    api.call<PlanView>(owner, "POST", "/plans", {
      title: "Пятница вечером",
      mode: "live",
      participantIds: [],
      matchRule: "majority",
      filters: FILTERS,
      ...body,
    });
  const createCustom = (caller: Caller, body: Record<string, unknown> = {}) =>
    api.call<Activity>(caller, "POST", "/activities", {
      title: "Шашлыки у Данияра на даче",
      description: "Берём мангал и гитару",
      pricePerPersonMax: 500,
      ...body,
    });
  const planPath = (id: string, action = "") =>
    `/plans/${encodeURIComponent(id)}${action}`;
  const act = (caller: Caller, id: string, action: string, body?: unknown) =>
    api.call<PlanView>(caller, "POST", planPath(id, action), body);
  const getPlan = (caller: Caller, id: string) =>
    api.call<PlanView>(caller, "GET", planPath(id));
  const swipe = (
    caller: Caller,
    id: string,
    activityId: string,
    decision: "like" | "pass" = "like",
  ) => act(caller, id, "/swipes", { activityId, decision });
  const catalogIds = async (caller: Caller, filters: unknown) =>
    (
      await api.call<Activity[]>(caller, "GET", "/activities", undefined, {
        filters: JSON.stringify(filters),
      })
    ).map((activity) => activity.id);
  // «Прямо сейчас» на троих, Азамат готов, организатор нажал «Поехали».
  const startLive = async (body: Record<string, unknown> = {}) => {
    const people = await trio();
    const created = await createPlan(people.owner, {
      participantIds: [people.azamat.id, people.nurai.id],
      ...body,
    });
    await act(people.azamat, created.plan.id, "/ready");
    const started = await act(people.owner, created.plan.id, "/start");
    return { ...people, id: started.plan.id, started };
  };
  const matchEvents = (planId: string) =>
    api
      .events()
      .filter(
        (event): event is PlanMatchEvent =>
          event.type === "plan:match" && event.planId === planId,
      );

  describe("создание", () => {
    it("«Прямо сейчас» со своим занятием: лобби, организатор готов, своё занятие первым", async () => {
      const { owner, azamat, nurai } = await trio();
      const custom = await createCustom(owner);
      expect(custom).toMatchObject({
        title: "Шашлыки у Данияра на даче",
        isCustom: true,
        createdBy: owner.id,
        pricePerPersonMin: 500,
        pricePerPersonMax: 500,
      });
      const view = await createPlan(owner, {
        participantIds: [azamat.id, nurai.id, azamat.id, owner.id],
        customActivityIds: [custom.id],
      });
      expect(view.plan).toMatchObject({
        title: "Пятница вечером",
        ownerId: owner.id,
        mode: "live",
        status: "lobby",
        participantIds: [owner.id, azamat.id, nurai.id],
        readyIds: [owner.id],
        matchRule: "majority",
        filters: FILTERS,
        customActivityIds: [custom.id],
        deck: [],
        swipes: {},
        finishedIds: [],
        votes: {},
      });
      expect(Date.parse(view.plan.createdAt)).toBe(NOW);
      expect(view.participants.map((p) => [p.id, p.name])).toEqual([
        [owner.id, "Айгерим"],
        [azamat.id, "Азамат"],
        [nurai.id, "Нурай"],
      ]);
      // До старта — из чего соберётся колода: своё занятие, потом каталог по
      // фильтрам в порядке каталога.
      const filtered = await catalogIds(owner, FILTERS);
      expect(filtered.length).toBeGreaterThan(1);
      expect(view.activities.map((a) => a.id)).toEqual([
        custom.id,
        ...filtered,
      ]);
    });

    it("ошибки: название, дата, своё занятие, пустая колода — VALIDATION", async () => {
      const owner = await person("Айгерим");
      const stranger = await person("Бермет");
      await fails(createPlan(owner, { title: "  " }), "VALIDATION");
      await fails(createPlan(owner, { title: "я".repeat(61) }), "VALIDATION");
      await fails(createPlan(owner, { mode: "deadline" }), "VALIDATION");
      await fails(
        createPlan(owner, {
          mode: "deadline",
          deadline: new Date(NOW - 60_000).toISOString(),
        }),
        "VALIDATION",
      );
      await fails(createPlan(owner, { matchRule: "most" }), "VALIDATION");
      await fails(createPlan(owner, { filters: EMPTY_FILTERS }), "VALIDATION");
      // Своё занятие — только своё и только существующее.
      const foreign = await createCustom(stranger);
      await fails(
        createPlan(owner, { customActivityIds: [foreign.id] }),
        "VALIDATION",
      );
      await fails(
        createPlan(owner, { customActivityIds: ["ca_nope"] }),
        "VALIDATION",
      );
      // Своё занятие спасает пустую колоду.
      const mine = await createCustom(owner);
      const rescued = await createPlan(owner, {
        filters: EMPTY_FILTERS,
        customActivityIds: [mine.id],
      });
      expect(rescued.activities.map((a) => a.id)).toEqual([mine.id]);
      // Форма своего занятия.
      await fails(createCustom(owner, { title: "" }), "VALIDATION");
      await fails(
        createCustom(owner, { pricePerPersonMin: 900, pricePerPersonMax: 500 }),
        "VALIDATION",
      );
    });

    it("позвать кнопкой можно только друзей с именем — остальных VALIDATION", async () => {
      const owner = await person("Айгерим");
      const friend = await person("Азамат");
      const stranger = await person("Бермет");
      const { caller: nameless } = await api.newUser();
      await api.befriend(owner, friend);
      await api.befriend(owner, nameless);
      await fails(
        createPlan(owner, { participantIds: [friend.id, stranger.id] }),
        "VALIDATION",
      );
      await fails(
        createPlan(owner, { participantIds: ["u_nobody"] }),
        "VALIDATION",
      );
      await fails(
        createPlan(owner, { participantIds: [nameless.id] }),
        "VALIDATION",
      );
      const view = await createPlan(owner, { participantIds: [friend.id] });
      expect(view.plan.participantIds).toEqual([owner.id, friend.id]);
      // Ошибочные попытки ничего не создали.
      const list = await api.call<PlanSummary[]>(owner, "GET", "/plans");
      expect(list.map((item) => item.plan.id)).toEqual([view.plan.id]);
    });

    it("без имени — NAME_REQUIRED", async () => {
      const { caller: nameless } = await api.newUser();
      await fails(createPlan(nameless), "NAME_REQUIRED");
    });

    it("«До даты»: без лобби, колода сразу — все занятия по фильтрам", async () => {
      const { owner, azamat } = await trio();
      const deadline = new Date(NOW + 2 * DAY).toISOString();
      const view = await createPlan(owner, {
        title: "На выходных",
        mode: "deadline",
        deadline,
        participantIds: [azamat.id],
      });
      expect(view.plan).toMatchObject({
        mode: "deadline",
        status: "swiping",
        readyIds: [],
        participantIds: [owner.id, azamat.id],
      });
      expect(Date.parse(view.plan.deadline ?? "")).toBe(NOW + 2 * DAY);
      const filtered = await catalogIds(owner, FILTERS);
      // Порядок перемешан — сравниваем состав.
      expect(sorted(view.plan.deck)).toEqual(sorted(filtered));
      expect(view.activities.map((a) => a.id)).toEqual(view.plan.deck);
      // Лобби нет — «Поехали» и «Готов» не нужны.
      await fails(act(owner, view.plan.id, "/start"), "CONFLICT");
      await fails(act(azamat, view.plan.id, "/ready"), "CONFLICT");
    });

    it("«Прямо сейчас» без фильтров — 20 занятий из разных категорий; «Все» и «До даты» — весь каталог (X05)", async () => {
      const { owner, azamat } = await trio();
      const all = await api.call<Activity[]>(owner, "GET", "/activities");
      expect(all.length).toBeGreaterThan(20);
      const categories = new Set(all.map((activity) => activity.category));
      const quick = await createPlan(owner, {
        participantIds: [azamat.id],
        filters: NO_FILTERS,
      });
      expect(quick.plan.filters).toEqual({ ...NO_FILTERS, deckSize: 20 });
      // Лобби показывает ровно те 20, что попадут в колоду, — при каждом
      // чтении одни и те же.
      const lobby = quick.activities.map((activity) => activity.id);
      expect(lobby).toHaveLength(20);
      expect(new Set(quick.activities.map((a) => a.category))).toEqual(
        categories,
      );
      const again = await getPlan(azamat, quick.plan.id);
      expect(again.activities.map((activity) => activity.id)).toEqual(lobby);
      const [summary] = await api.call<PlanSummary[]>(owner, "GET", "/plans");
      expect(summary?.activityCount).toBe(20);
      await act(azamat, quick.plan.id, "/ready");
      const started = await act(owner, quick.plan.id, "/start");
      expect(sorted(started.plan.deck)).toEqual(sorted(lobby));

      // «Все 50» — переключатель на шаге «Что выбираем?».
      const full = await createPlan(owner, {
        filters: { ...NO_FILTERS, deckSize: null },
      });
      expect(full.activities).toHaveLength(all.length);
      // «До даты» — как раньше: весь каталог по фильтрам.
      const later = await createPlan(owner, {
        mode: "deadline",
        deadline: new Date(NOW + DAY).toISOString(),
        filters: NO_FILTERS,
      });
      expect(later.plan.filters.deckSize).toBeNull();
      expect(later.plan.deck).toHaveLength(all.length);
      await fails(
        createPlan(owner, { filters: { ...NO_FILTERS, deckSize: 0 } }),
        "VALIDATION",
      );
    });
  });

  describe("список планов", () => {
    it("у организатора и у участника, новые сверху, с превью; чужому — пусто", async () => {
      const { owner, azamat, nurai } = await trio();
      const custom = await createCustom(owner);
      const first = await createPlan(owner, {
        participantIds: [azamat.id],
        customActivityIds: [custom.id],
      });
      api.advance(60_000);
      const second = await createPlan(owner, {
        title: "Суббота",
        participantIds: [azamat.id, nurai.id],
      });
      const mine = await api.call<PlanSummary[]>(owner, "GET", "/plans");
      expect(mine.map((item) => item.plan.id)).toEqual([
        second.plan.id,
        first.plan.id,
      ]);
      const filtered = await catalogIds(owner, FILTERS);
      expect(mine[0]?.activityCount).toBe(filtered.length);
      expect(mine[1]?.activityCount).toBe(filtered.length + 1);
      expect(mine[0]?.preview.map((a) => a.id)).toEqual(filtered.slice(0, 3));
      expect(mine[1]?.preview[0]?.id).toBe(custom.id);
      expect(mine[1]?.preview).toHaveLength(3);
      expect(mine[0]?.participants.map((p) => p.id)).toEqual([
        owner.id,
        azamat.id,
        nurai.id,
      ]);

      const forAzamat = await api.call<PlanSummary[]>(azamat, "GET", "/plans");
      expect(forAzamat.map((item) => item.plan.id)).toEqual([
        second.plan.id,
        first.plan.id,
      ]);
      const forNurai = await api.call<PlanSummary[]>(nurai, "GET", "/plans");
      expect(forNurai.map((item) => item.plan.id)).toEqual([second.plan.id]);
      const stranger = await person("Бермет");
      expect(await api.call(stranger, "GET", "/plans")).toEqual([]);
    });
  });

  describe("лобби", () => {
    it("вступление по ссылке: план виден до вступления, участник — в конце, повтор ничего не меняет", async () => {
      const { owner, azamat } = await trio();
      const view = await createPlan(owner, { participantIds: [azamat.id] });
      const id = view.plan.id;
      // Гость — не друг организатора: только по ссылке.
      const guest = await person("Айжан");
      const preview = await getPlan(guest, id);
      expect(preview.plan).toMatchObject({
        id,
        title: "Пятница вечером",
        ownerId: owner.id,
        mode: "live",
        status: "lobby",
      });
      expect(preview.participants.map((p) => p.name)).toEqual([
        "Айгерим",
        "Азамат",
      ]);

      const joined = await act(guest, id, "/join");
      expect(joined.plan.participantIds).toEqual([
        owner.id,
        azamat.id,
        guest.id,
      ]);
      expect(joined.participants.map((p) => p.name)).toEqual([
        "Айгерим",
        "Азамат",
        "Айжан",
      ]);
      const again = await act(guest, id, "/join");
      expect(again.plan.participantIds).toEqual([
        owner.id,
        azamat.id,
        guest.id,
      ]);
      // Организатор и приглашённый тоже «вступают» без последствий.
      const ownerAgain = await act(owner, id, "/join");
      expect(ownerAgain.plan.participantIds).toEqual([
        owner.id,
        azamat.id,
        guest.id,
      ]);
      // Организатор видит участника сразу, план — в списке гостя.
      const seen = await getPlan(owner, id);
      expect(seen.participants.map((p) => p.id)).toContain(guest.id);
      const list = await api.call<PlanSummary[]>(guest, "GET", "/plans");
      expect(list.map((item) => item.plan.id)).toEqual([id]);
    });

    it("вступить без имени — NAME_REQUIRED; неизвестный план — NOT_FOUND", async () => {
      const owner = await person("Айгерим");
      const view = await createPlan(owner);
      const { caller: nameless } = await api.newUser();
      await fails(act(nameless, view.plan.id, "/join"), "NAME_REQUIRED");
      await fails(getPlan(owner, "pl_nope"), "NOT_FOUND");
      await fails(act(owner, "pl_nope", "/join"), "NOT_FOUND");
      await fails(act(nameless, "pl_nope", "/join"), "NOT_FOUND");
    });

    it("«Готов»: только участник, отметку можно снять, организатор готов всегда", async () => {
      const { owner, azamat, nurai } = await trio();
      const view = await createPlan(owner, {
        participantIds: [azamat.id, nurai.id],
      });
      const id = view.plan.id;
      const stranger = await person("Бермет");
      await fails(act(stranger, id, "/ready"), "FORBIDDEN");

      const ready = await act(azamat, id, "/ready");
      expect(sorted(ready.plan.readyIds)).toEqual(
        sorted([owner.id, azamat.id]),
      );
      const both = await act(nurai, id, "/ready", { ready: true });
      expect(sorted(both.plan.readyIds)).toEqual(
        sorted([owner.id, azamat.id, nurai.id]),
      );
      // Повтор не дублирует.
      const twice = await act(nurai, id, "/ready");
      expect(sorted(twice.plan.readyIds)).toEqual(
        sorted([owner.id, azamat.id, nurai.id]),
      );
      const unready = await act(azamat, id, "/ready", { ready: false });
      expect(sorted(unready.plan.readyIds)).toEqual(
        sorted([owner.id, nurai.id]),
      );
      await fails(act(owner, id, "/ready", { ready: false }), "VALIDATION");
      await fails(act(nurai, id, "/ready", { ready: "да" }), "VALIDATION");
    });
  });

  describe("старт и колода", () => {
    it("«Поехали»: только организатор и только когда готовы двое", async () => {
      const { owner, azamat, nurai } = await trio();
      const view = await createPlan(owner, {
        participantIds: [azamat.id, nurai.id],
      });
      const id = view.plan.id;
      await fails(act(azamat, id, "/start"), "FORBIDDEN");
      // Готов один организатор.
      await fails(act(owner, id, "/start"), "CONFLICT");
      await act(nurai, id, "/ready");
      await fails(act(nurai, id, "/start"), "FORBIDDEN");
      const started = await act(owner, id, "/start");
      expect(started.plan.status).toBe("swiping");
      await fails(act(owner, "pl_nope", "/start"), "NOT_FOUND");
    });

    it("колода собирается один раз, порядок общий, свои + по фильтрам", async () => {
      const { owner, azamat, nurai } = await trio();
      const custom = await createCustom(owner);
      const view = await createPlan(owner, {
        participantIds: [azamat.id, nurai.id],
        customActivityIds: [custom.id],
      });
      const id = view.plan.id;
      await act(azamat, id, "/ready");
      const started = await act(owner, id, "/start");
      const { deck } = started.plan;
      expect(started.plan.status).toBe("swiping");
      expect(sorted(deck)).toEqual(
        sorted([custom.id, ...(await catalogIds(owner, FILTERS))]),
      );
      expect(started.activities.map((a) => a.id)).toEqual(deck);
      // Второй старт — CONFLICT, колода не перемешивается заново.
      await fails(act(owner, id, "/start"), "CONFLICT");
      for (const caller of [owner, azamat, nurai]) {
        const seen = await getPlan(caller, id);
        expect(seen.plan.deck).toEqual(deck);
        expect(seen.activities.map((a) => a.id)).toEqual(deck);
      }
      // После старта «Готов» уже не жмут.
      await fails(act(nurai, id, "/ready"), "CONFLICT");
    });
  });

  describe("свайп колоды", () => {
    it("только участник, только во время свайпа, только карточки колоды; повтор заменяет", async () => {
      const { owner, azamat, nurai } = await trio();
      const view = await createPlan(owner, {
        participantIds: [azamat.id, nurai.id],
      });
      const id = view.plan.id;
      const someCard = view.activities[0]?.id ?? "";
      // Лобби: колоды ещё нет.
      await fails(swipe(owner, id, someCard), "CONFLICT");
      await fails(act(owner, id, "/finish"), "CONFLICT");
      await act(azamat, id, "/ready");
      const started = await act(owner, id, "/start");
      const card = started.plan.deck[0] ?? "";
      const stranger = await person("Бермет");
      await fails(swipe(stranger, id, card), "FORBIDDEN");
      await fails(act(stranger, id, "/finish"), "FORBIDDEN");
      await fails(swipe(owner, id, "a_999"), "VALIDATION");
      await fails(
        act(owner, id, "/swipes", { activityId: card, decision: "superlike" }),
        "VALIDATION",
      );
      await fails(
        act(owner, id, "/swipes", { decision: "like" }),
        "VALIDATION",
      );
      await fails(swipe(owner, "pl_nope", card), "NOT_FOUND");
      await swipe(owner, id, card, "pass");
      const again = await swipe(owner, id, card, "like");
      expect(again.plan.swipes[owner.id]).toEqual({ [card]: "like" });
      expect(again.plan.status).toBe("swiping");
    });

    it("не участнику GET /plans/:id — превью без свайпов и голосов", async () => {
      const { owner, id, started } = await startLive();
      const card = started.plan.deck[0] ?? "";
      await swipe(owner, id, card, "like");
      const stranger = await person("Бермет");
      const preview = await getPlan(stranger, id);
      expect(preview.plan).toMatchObject({
        id,
        title: "Пятница вечером",
        ownerId: owner.id,
        status: "swiping",
      });
      expect(preview.participants.map((p) => p.name)).toEqual([
        "Айгерим",
        "Азамат",
        "Нурай",
      ]);
      // Только сервер (BACKEND.md §4.4): мок отдаёт план целиком.
      if (api.kind === "server") {
        expect(preview.plan.swipes).toEqual({});
        expect(preview.plan.votes).toEqual({});
      }
      // Участник видит свайпы.
      expect((await getPlan(owner, id)).plan.swipes[owner.id]).toEqual({
        [card]: "like",
      });
    });

    it("plan:match — ровно одно на новое совпадение по большинству", async () => {
      const { owner, azamat, nurai, id, started } = await startLive();
      const [card = "", other = ""] = started.plan.deck;
      // 1 из 3 — ещё не большинство.
      await swipe(owner, id, card);
      expect(matchEvents(id)).toEqual([]);
      await swipe(azamat, id, card);
      expect(matchEvents(id)).toEqual([
        { type: "plan:match", planId: id, activityId: card },
      ]);
      // Уже совпадение: ни третий лайк, ни повтор не шлют событие снова.
      await swipe(nurai, id, card);
      await swipe(azamat, id, card);
      await swipe(owner, id, other, "pass");
      expect(matchEvents(id)).toHaveLength(1);
      // Совпадение пропало и набралось снова — новое событие.
      await swipe(azamat, id, card, "pass");
      await swipe(nurai, id, card, "pass");
      expect(matchEvents(id)).toHaveLength(1);
      await swipe(nurai, id, card, "like");
      expect(matchEvents(id)).toEqual([
        { type: "plan:match", planId: id, activityId: card },
        { type: "plan:match", planId: id, activityId: card },
      ]);
    });

    it("правило «все»: совпадение только после лайка последнего", async () => {
      const { owner, azamat, nurai, id, started } = await startLive({
        matchRule: "all",
      });
      const card = started.plan.deck[1] ?? "";
      await swipe(owner, id, card);
      await swipe(azamat, id, card);
      expect(matchEvents(id)).toEqual([]);
      await swipe(nurai, id, card);
      expect(matchEvents(id)).toEqual([
        { type: "plan:match", planId: id, activityId: card },
      ]);
    });

    it("последняя карточка — «закончил», закончили все — результаты; совпадения объявлены по разу", async () => {
      const { owner, azamat, nurai, id, started } = await startLive();
      const { deck } = started.plan;
      const everyone = [owner, azamat, nurai];
      let last = started;
      for (const [index, caller] of everyone.entries()) {
        // Каждый лайкает чётные карточки — совпадения по большинству.
        for (const [cardIndex, card] of deck.entries()) {
          last = await swipe(
            caller,
            id,
            card,
            cardIndex % 2 === 0 ? "like" : "pass",
          );
        }
        expect(last.plan.finishedIds).toContain(caller.id);
        if (index < everyone.length - 1) {
          expect(last.plan.status).toBe("swiping");
        }
      }
      expect(last.plan.status).toBe("results");
      expect(sorted(last.plan.finishedIds)).toEqual(
        sorted(everyone.map((c) => c.id)),
      );
      const expected = computeMatches(last.plan, last.activities).matches.map(
        (m) => m.activityId,
      );
      expect(sorted(expected)).toEqual(
        sorted(deck.filter((_, i) => i % 2 === 0)),
      );
      expect(sorted(matchEvents(id).map((e) => e.activityId))).toEqual(
        sorted(expected),
      );
      // Колода закрыта: свайп и отмена — CONFLICT, /finish ничего не ломает.
      await fails(swipe(owner, id, deck[0] ?? ""), "CONFLICT");
      await fails(
        act(owner, id, "/swipes/undo", { activityId: deck[0] }),
        "CONFLICT",
      );
      const finished = await act(owner, id, "/finish");
      expect(finished.plan.status).toBe("results");
    });

    it("/finish: повтор ничего не меняет, закончили все — результаты", async () => {
      const { owner, azamat, nurai, id } = await startLive();
      await fails(act(owner, "pl_nope", "/finish"), "NOT_FOUND");
      const once = await act(owner, id, "/finish");
      expect(once.plan.finishedIds).toEqual([owner.id]);
      const twice = await act(owner, id, "/finish");
      expect(twice.plan.finishedIds).toEqual([owner.id]);
      expect(twice.plan.status).toBe("swiping");
      await act(azamat, id, "/finish");
      const last = await act(nurai, id, "/finish");
      expect(last.plan.status).toBe("results");
      expect(sorted(last.plan.finishedIds)).toEqual(
        sorted([owner.id, azamat.id, nurai.id]),
      );
    });

    it("«Вернуть карточку»: свайп удаляется, «закончил» снимается; отменять нечего — CONFLICT", async () => {
      const { owner, azamat, id, started } = await startLive();
      const { deck } = started.plan;
      for (const card of deck) await swipe(owner, id, card);
      const lastCard = deck.at(-1) ?? "";
      const undone = await act(owner, id, "/swipes/undo", {
        activityId: lastCard,
      });
      expect(undone.plan.swipes[owner.id]?.[lastCard]).toBeUndefined();
      expect(Object.keys(undone.plan.swipes[owner.id] ?? {})).toHaveLength(
        deck.length - 1,
      );
      expect(undone.plan.finishedIds).toEqual([]);
      // Второй раз и не свайпнутую карточку отменить нельзя.
      await fails(
        act(owner, id, "/swipes/undo", { activityId: lastCard }),
        "CONFLICT",
      );
      await fails(
        act(azamat, id, "/swipes/undo", { activityId: lastCard }),
        "CONFLICT",
      );
      await fails(act(owner, id, "/swipes/undo", {}), "VALIDATION");
      const stranger = await person("Бермет");
      await fails(
        act(stranger, id, "/swipes/undo", { activityId: lastCard }),
        "FORBIDDEN",
      );
      // Досвайпал снова — снова «закончил».
      const redone = await swipe(owner, id, lastCard, "pass");
      expect(redone.plan.finishedIds).toEqual([owner.id]);
    });
  });

  describe("дедлайн «До даты»", () => {
    const createDeadline = async () => {
      const owner = await person("Айгерим");
      const azamat = await person("Азамат");
      await api.befriend(owner, azamat);
      const view = await createPlan(owner, {
        title: "На выходных",
        mode: "deadline",
        deadline: new Date(NOW + 2 * DAY).toISOString(),
        participantIds: [azamat.id],
      });
      return { owner, azamat, view, id: view.plan.id };
    };

    it("закончили все — к результатам, не дожидаясь даты", async () => {
      const { owner, azamat, view, id } = await createDeadline();
      let last = view;
      for (const caller of [owner, azamat]) {
        for (const card of view.plan.deck) last = await swipe(caller, id, card);
      }
      expect(sorted(last.plan.finishedIds)).toEqual(
        sorted([owner.id, azamat.id]),
      );
      expect(last.plan.status).toBe("results");
    });

    it("после даты свайп и отмена — CONFLICT", async () => {
      const { owner, azamat, view, id } = await createDeadline();
      const [first = "", second = ""] = view.plan.deck;
      api.advance(DAY);
      await swipe(owner, id, first);
      api.advance(DAY + 60_000);
      await fails(swipe(azamat, id, first), "CONFLICT");
      await fails(swipe(owner, id, second), "CONFLICT");
      await fails(
        act(owner, id, "/swipes/undo", { activityId: first }),
        "CONFLICT",
      );
      // Свайп, принятый до даты, на месте.
      expect((await getPlan(owner, id)).plan.swipes[owner.id]).toEqual({
        [first]: "like",
      });
    });
  });

  describe("«Выйти из плана» (Q04)", () => {
    it("из колоды: остальные долистали → итоги; свайпов и «готов» ушедшего нет", async () => {
      const { owner, azamat, nurai, id, started } = await startLive();
      const { deck } = started.plan;
      for (const caller of [owner, azamat]) {
        for (const card of deck) await swipe(caller, id, card);
      }
      await swipe(nurai, id, deck[0] ?? "", "pass");
      const left = await act(nurai, id, "/leave");
      expect(left.plan.status).toBe("results");
      expect(left.plan.participantIds).toEqual([owner.id, azamat.id]);
      expect(left.plan.swipes[nurai.id]).toBeUndefined();
      expect(left.plan.readyIds).not.toContain(nurai.id);
      expect(left.plan.finishedIds).not.toContain(nurai.id);
      expect(left.participants.map((p) => p.id)).toEqual([owner.id, azamat.id]);
      // Плана больше нет в её списке.
      expect(
        (await api.call<PlanSummary[]>(nurai, "GET", "/plans")).map(
          (s) => s.plan.id,
        ),
      ).toEqual([]);
    });

    it("из лобби; повтор ничего не меняет; организатор — FORBIDDEN; после итогов — CONFLICT", async () => {
      const { owner, azamat, nurai } = await trio();
      const lobby = await createPlan(owner, {
        participantIds: [azamat.id, nurai.id],
      });
      const id = lobby.plan.id;
      await act(azamat, id, "/ready");
      const left = await act(azamat, id, "/leave");
      expect(left.plan.status).toBe("lobby");
      expect(left.plan.participantIds).toEqual([owner.id, nurai.id]);
      expect(left.plan.readyIds).toEqual([owner.id]);
      const again = await act(azamat, id, "/leave");
      expect(again.plan.participantIds).toEqual([owner.id, nurai.id]);
      await fails(act(owner, id, "/leave"), "FORBIDDEN");
      await fails(act(nurai, "pl_nope", "/leave"), "NOT_FOUND");

      // Нурай и организатор долистали → итоги; выйти уже нельзя.
      await act(nurai, id, "/ready");
      const started = await act(owner, id, "/start");
      for (const caller of [owner, nurai]) {
        for (const card of started.plan.deck) await swipe(caller, id, card);
      }
      await fails(act(nurai, id, "/leave"), "CONFLICT");
    });
  });

  describe("«Показать итоги сейчас»", () => {
    it("только организатор и когда долистали хотя бы двое", async () => {
      const { owner, azamat, nurai } = await trio();
      const lobby = await createPlan(owner, {
        participantIds: [azamat.id, nurai.id],
      });
      await fails(act(owner, lobby.plan.id, "/close"), "CONFLICT");
      await act(azamat, lobby.plan.id, "/ready");
      const started = await act(owner, lobby.plan.id, "/start");
      const id = started.plan.id;
      await fails(act(azamat, id, "/close"), "FORBIDDEN");
      for (const card of started.plan.deck)
        await swipe(owner, id, card, "pass");
      await fails(act(owner, id, "/close"), "CONFLICT");
      await fails(act(nurai, id, "/close"), "FORBIDDEN");
      await fails(act(owner, "pl_nope", "/close"), "NOT_FOUND");
    });

    it("«Все за» — среди долиставших; повтор ничего не меняет; недолиставший видит итоги", async () => {
      const { owner, azamat, nurai, id, started } = await startLive({
        matchRule: "all",
      });
      const { deck } = started.plan;
      const [first = "", second = ""] = deck;
      // Айгерим и Азамат долистали, лайкнули первую; Нурай бросила на второй.
      for (const caller of [owner, azamat]) {
        for (const card of deck) {
          await swipe(caller, id, card, card === first ? "like" : "pass");
        }
      }
      await swipe(nurai, id, first, "pass");
      await swipe(nurai, id, second, "like");
      const closed = await act(owner, id, "/close");
      expect(closed.plan).toMatchObject({
        status: "results",
        closedEarly: true,
        votes: {},
      });
      expect(
        computeMatches(closed.plan, closed.activities).matches.map(
          (m) => m.activityId,
        ),
      ).toEqual([first]);
      const again = await act(owner, id, "/close");
      expect(again.plan).toEqual(closed.plan);
      const forNurai = await getPlan(nurai, id);
      expect(forNurai.plan.status).toBe("results");
      await fails(swipe(nurai, id, deck[2] ?? ""), "CONFLICT");
    });
  });
});
