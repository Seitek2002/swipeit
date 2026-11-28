import type { Activity } from "@swipeit/core/api/catalog/types";
import type { PlanSummary, PlanView } from "@swipeit/core/api/plans/types";
import {
  computeMatches,
  decisionCandidates,
  voteCandidates,
} from "@swipeit/core/logic/matches";
import { isTimedOutWithoutResults } from "@swipeit/core/logic/plan-close";
import type { RealtimeEvent } from "@swipeit/core/realtime/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { type ApiClient, type Caller, CLIENTS, NOW } from "./client";

// Контрактный тест «Че делать будем?» после колоды (BACKEND.md B10) — по
// plans-results.test.ts мока: голоса, барабан, «Решено», отмена решения,
// выходы из «Совпадений нет», новый круг и дедлайны «До даты». Ботов нет:
// всё делают трое людей сами, только через API. Каталог — настоящий, id
// занятий берём из ответов. Какое занятие выпало на барабане — не
// сравниваем: только что оно из пула.
const DAY = 24 * 3600_000;

// Культура до 200 сом на человека — короткая колода из нескольких занятий.
const FILTERS = {
  categories: ["culture"],
  budgetPerPerson: { min: 0, max: 200 },
};

const STATUS = {
  CONFLICT: 409,
  FORBIDDEN: 403,
  NAME_REQUIRED: 409,
  NOT_FOUND: 404,
  VALIDATION: 400,
} as const;

type ToastEvent = Extract<RealtimeEvent, { type: "toast" }>;

const sorted = (ids: readonly string[]) => [...ids].sort();

describe.each(CLIENTS)("«Че делать будем?», итоги — %s", (_name, create) => {
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
    decision: "like" | "pass",
  ) => act(caller, id, "/swipes", { activityId, decision });
  const vote = (caller: Caller, id: string, activityId: null | string) =>
    act(caller, id, "/votes", { activityId });
  const decide = (caller: Caller, id: string, body: unknown) =>
    act(caller, id, "/decide", body);
  const addActivities = (caller: Caller, id: string, body: unknown) =>
    act(caller, id, "/activities", body);

  // «Прямо сейчас» на троих: Азамат готов, организатор нажал «Поехали».
  const startLive = async (matchRule: "all" | "majority" = "all") => {
    const people = await trio();
    const created = await api.call<PlanView>(people.owner, "POST", "/plans", {
      title: "Пятница вечером",
      mode: "live",
      participantIds: [people.azamat.id, people.nurai.id],
      matchRule,
      filters: FILTERS,
    });
    await act(people.azamat, created.plan.id, "/ready");
    const started = await act(people.owner, created.plan.id, "/start");
    return { ...people, id: started.plan.id, started };
  };
  // Участники проходят колоду по строкам: "LLP" — первые две карточки лайк,
  // остальные — пас; нет строки — пас на всё.
  const playDeck = async (view: PlanView, players: Array<[Caller, string]>) => {
    let last = view;
    for (const [caller, row] of players) {
      for (const [index, card] of view.plan.deck.entries()) {
        last = await swipe(
          caller,
          view.plan.id,
          card,
          row[index] === "L" ? "like" : "pass",
        );
      }
    }
    return last;
  };
  // План на результатах: строки — по участникам по порядку (организатор,
  // Азамат, Нурай). По умолчанию все лайкнули первые две карточки.
  const toResults = async (
    rows: [string, string, string] = ["LL", "LL", "LL"],
    matchRule: "all" | "majority" = "all",
  ) => {
    const live = await startLive(matchRule);
    const view = await playDeck(live.started, [
      [live.owner, rows[0]],
      [live.azamat, rows[1]],
      [live.nurai, rows[2]],
    ]);
    expect(view.plan.status).toBe("results");
    return { ...live, view };
  };
  // Занятие каталога, которого нет в колоде.
  const outsideDeck = async (caller: Caller, deck: readonly string[]) => {
    const all = await api.call<Activity[]>(caller, "GET", "/activities");
    const found = all.find((activity) => !deck.includes(activity.id));
    if (!found) throw new Error("Каталог весь в колоде");
    return found.id;
  };

  describe("голосование «Выбрать самим»", () => {
    it("один голос на человека, повтор заменяет, null снимает", async () => {
      const { owner, azamat, id, view } = await toResults();
      const [first = "", second = "", third = ""] = view.plan.deck;
      await vote(owner, id, first);
      let last = await vote(azamat, id, first);
      expect(last.plan.votes).toEqual({
        [owner.id]: first,
        [azamat.id]: first,
      });
      last = await vote(owner, id, second);
      expect(last.plan.votes).toEqual({
        [owner.id]: second,
        [azamat.id]: first,
      });
      last = await vote(owner, id, null);
      expect(last.plan.votes).toEqual({ [azamat.id]: first });
      // Снять голос, которого нет, — тоже можно.
      last = await vote(owner, id, null);
      expect(last.plan.votes).toEqual({ [azamat.id]: first });
      // Голосуют только за совпадения, если они есть.
      await fails(vote(owner, id, third), "VALIDATION");
      await fails(vote(owner, id, "a_999"), "VALIDATION");
      await fails(act(owner, id, "/votes", {}), "VALIDATION");
      await fails(act(owner, id, "/votes", { activityId: "" }), "VALIDATION");
      const stranger = await person("Бермет");
      await fails(vote(stranger, id, first), "FORBIDDEN");
      await fails(vote(owner, "pl_nope", first), "NOT_FOUND");
      // Не участнику — превью без голосов. Только сервер (BACKEND.md §4.4):
      // мок отдаёт план целиком.
      const preview = await getPlan(stranger, id);
      expect(preview.plan.status).toBe("results");
      if (api.kind === "server") {
        expect(preview.plan.votes).toEqual({});
        expect(preview.plan.swipes).toEqual({});
      }
    });

    it("до результатов голосовать нельзя; без совпадений — за любое занятие", async () => {
      const live = await startLive("all");
      const card = live.started.plan.deck[3] ?? "";
      await fails(vote(live.owner, live.id, card), "CONFLICT");
      const view = await playDeck(live.started, [
        [live.owner, ""],
        [live.azamat, ""],
        [live.nurai, ""],
      ]);
      expect(view.plan.status).toBe("results");
      expect(decisionCandidates(view.plan, view.activities)).toEqual({
        pool: [],
        source: "none",
      });
      expect(voteCandidates(view.plan, view.activities)).toEqual(
        view.plan.deck,
      );
      const voted = await vote(live.owner, live.id, card);
      expect(voted.plan.votes).toEqual({ [live.owner.id]: card });
    });
  });

  describe("решение", () => {
    it("барабан: крутит только организатор, итог — из пула", async () => {
      const { owner, azamat, id, view } = await toResults();
      const { pool, source } = decisionCandidates(view.plan, view.activities);
      expect(source).toBe("matches");
      expect(sorted(pool)).toEqual(sorted(view.plan.deck.slice(0, 2)));
      await fails(decide(azamat, id, { method: "random" }), "FORBIDDEN");
      await fails(decide(owner, "pl_nope", { method: "random" }), "NOT_FOUND");
      api.advance(60_000);
      const decided = await decide(owner, id, { method: "random" });
      expect(decided.plan.status).toBe("decided");
      expect(decided.plan.decision).toMatchObject({ method: "random" });
      expect(decided.plan.decision?.scheduledFor).toBeUndefined();
      expect(Date.parse(decided.plan.decision?.decidedAt ?? "")).toBe(
        NOW + 60_000,
      );
      expect(pool).toContain(decided.plan.decision?.activityId);
      // Итог виден всем участникам.
      expect((await getPlan(azamat, id)).plan.decision).toEqual(
        decided.plan.decision,
      );
    });

    it("без совпадений барабан крутится среди «почти», без них — CONFLICT", async () => {
      // Правило «все»: третью карточку лайкнули двое из трёх.
      const almost = await toResults(["PPL", "PPL", ""]);
      const third = almost.view.plan.deck[2] ?? "";
      expect(
        decisionCandidates(almost.view.plan, almost.view.activities),
      ).toEqual({ pool: [third], source: "almost" });
      const decided = await decide(almost.owner, almost.id, {
        method: "random",
      });
      expect(decided.plan.decision?.activityId).toBe(third);

      const none = await toResults(["", "", ""]);
      await fails(
        decide(none.owner, none.id, { method: "random" }),
        "CONFLICT",
      );
      expect((await getPlan(none.owner, none.id)).plan.status).toBe("results");
    });

    it("решённый план второй раз не решается, scheduledFor сохраняется, решение — первым в превью", async () => {
      const { owner, azamat, id, view } = await toResults();
      const card = view.plan.deck[1] ?? "";
      const scheduledFor = new Date(NOW + DAY).toISOString();
      const decided = await decide(owner, id, {
        method: "owner",
        activityId: card,
        scheduledFor,
      });
      expect(decided.plan.decision).toMatchObject({
        activityId: card,
        method: "owner",
      });
      expect(Date.parse(decided.plan.decision?.scheduledFor ?? "")).toBe(
        NOW + DAY,
      );
      for (const body of [
        { method: "random" },
        { method: "owner", activityId: view.plan.deck[0] },
      ]) {
        await fails(decide(owner, id, body), "CONFLICT");
      }
      await fails(vote(azamat, id, card), "CONFLICT");
      await fails(
        act(owner, id, "/rule", { matchRule: "majority" }),
        "CONFLICT",
      );
      const list = await api.call<PlanSummary[]>(owner, "GET", "/plans");
      expect(list[0]?.plan.id).toBe(id);
      expect(list[0]?.preview[0]?.id).toBe(card);
    });

    it("битая дата scheduledFor — VALIDATION", async () => {
      const { owner, id, view } = await toResults();
      await fails(
        decide(owner, id, {
          method: "owner",
          activityId: view.plan.deck[0],
          scheduledFor: "в субботу",
        }),
        "VALIDATION",
      );
      expect((await getPlan(owner, id)).plan.status).toBe("results");
    });

    it("«Утвердить»: только лидер голосования", async () => {
      const { owner, azamat, nurai, id, view } = await toResults();
      const [first = "", second = ""] = view.plan.deck;
      // Пока никто не голосовал.
      await fails(
        decide(owner, id, { method: "vote", activityId: first }),
        "CONFLICT",
      );
      await vote(owner, id, first);
      await vote(azamat, id, second);
      await vote(nurai, id, second);
      await fails(
        decide(owner, id, { method: "vote", activityId: first }),
        "CONFLICT",
      );
      await fails(decide(owner, id, { method: "vote" }), "VALIDATION");
      await fails(
        decide(azamat, id, { method: "vote", activityId: second }),
        "FORBIDDEN",
      );
      const decided = await decide(owner, id, {
        method: "vote",
        activityId: second,
      });
      expect(decided.plan.decision).toMatchObject({
        activityId: second,
        method: "vote",
      });
    });

    it("организатор выбирает сам — любое занятие колоды", async () => {
      const { owner, id, view } = await toResults();
      await fails(decide(owner, id, { method: "owner" }), "VALIDATION");
      await fails(
        decide(owner, id, { method: "owner", activityId: "a_999" }),
        "VALIDATION",
      );
      await fails(decide(owner, id, { method: "coin" }), "VALIDATION");
      await fails(decide(owner, id, {}), "VALIDATION");
      // Не совпадение — тоже можно: решает организатор.
      const last = view.plan.deck.at(-1) ?? "";
      const decided = await decide(owner, id, {
        method: "owner",
        activityId: last,
      });
      expect(decided.plan.decision).toMatchObject({
        activityId: last,
        method: "owner",
      });
    });

    it("во время свайпа решать нельзя", async () => {
      const { owner, id } = await startLive("all");
      await fails(decide(owner, id, { method: "random" }), "CONFLICT");
      await fails(act(owner, id, "/decide/cancel"), "CONFLICT");
    });
  });

  describe("«Отменить решение»", () => {
    it("только организатор; все снова на результатах, голоса заново, тост — остальным", async () => {
      const { owner, azamat, nurai, id, view } = await toResults();
      await vote(azamat, id, view.plan.deck[0] ?? "");
      await decide(owner, id, { method: "random" });
      for (const caller of [azamat, nurai]) {
        await fails(act(caller, id, "/decide/cancel"), "FORBIDDEN");
      }
      const before = api.events().length;
      const cancelled = await act(owner, id, "/decide/cancel");
      expect(cancelled.plan.status).toBe("results");
      expect(cancelled.plan.decision).toBeUndefined();
      expect(cancelled.plan.votes).toEqual({});
      const toasts = api
        .events()
        .slice(before)
        .filter((event): event is ToastEvent => event.type === "toast");
      expect(sorted(toasts.map((t) => t.forUserId ?? ""))).toEqual(
        sorted([azamat.id, nurai.id]),
      );
      expect(toasts.map((t) => t.text)).toEqual([
        "Организатор отменил решение",
        "Организатор отменил решение",
      ]);
      expect((await getPlan(nurai, id)).plan.decision).toBeUndefined();
      await fails(act(owner, id, "/decide/cancel"), "CONFLICT");
      // После отмены барабан снова доступен.
      const again = await decide(owner, id, { method: "random" });
      expect(again.plan.status).toBe("decided");
    });
  });

  describe("выходы из «Совпадений нет»", () => {
    it("«Считать по большинству»: правило меняется, голоса за выбывших снимаются", async () => {
      // Большинство: первую лайкнули все, вторую — двое из трёх.
      const { owner, azamat, nurai, id, view } = await toResults(
        ["LL", "LL", "L"],
        "majority",
      );
      const [first = "", second = ""] = view.plan.deck;
      await vote(owner, id, first);
      await vote(azamat, id, second);
      await vote(nurai, id, second);
      await fails(act(azamat, id, "/rule", { matchRule: "all" }), "FORBIDDEN");
      await fails(act(owner, id, "/rule", { matchRule: "most" }), "VALIDATION");
      const strict = await act(owner, id, "/rule", { matchRule: "all" });
      expect(strict.plan.matchRule).toBe("all");
      // Вторая стала «почти», а барабан крутится среди совпадений — голоса
      // за неё сняты.
      expect(decisionCandidates(strict.plan, strict.activities).pool).toEqual([
        first,
      ]);
      expect(strict.plan.votes).toEqual({ [owner.id]: first });
      const loose = await act(owner, id, "/rule", { matchRule: "majority" });
      expect(loose.plan.matchRule).toBe("majority");
      expect(
        sorted(decisionCandidates(loose.plan, loose.activities).pool),
      ).toEqual(sorted([first, second]));
      expect(loose.plan.votes).toEqual({ [owner.id]: first });
    });

    it("во время свайпа правило не меняется", async () => {
      const { owner, id } = await startLive("all");
      await fails(
        act(owner, id, "/rule", { matchRule: "majority" }),
        "CONFLICT",
      );
    });

    it("«Добавить ещё занятий»: в конец колоды, снова свайп, «закончил» сброшен", async () => {
      const { owner, azamat, nurai, id, view } = await toResults(["", "", ""]);
      const { deck } = view.plan;
      const extra = await outsideDeck(owner, deck);
      const custom = await api.call<Activity>(owner, "POST", "/activities", {
        title: "Шашлыки у Данияра на даче",
        pricePerPersonMax: 500,
      });
      const stranger = await person("Бермет");
      const foreign = await api.call<Activity>(
        stranger,
        "POST",
        "/activities",
        { title: "Чужое" },
      );
      const add = (caller: Caller, activityIds: string[]) =>
        addActivities(caller, id, { activityIds });
      await fails(add(azamat, [extra]), "FORBIDDEN");
      await fails(add(owner, [foreign.id]), "VALIDATION");
      await fails(add(owner, ["a_999"]), "VALIDATION");
      await fails(add(owner, [deck[0] ?? ""]), "VALIDATION");
      await fails(add(owner, []), "VALIDATION");

      await vote(owner, id, deck[0] ?? "");
      const added = await add(owner, [extra, deck[0] ?? "", custom.id, extra]);
      expect(added.plan.deck).toEqual([...deck, extra, custom.id]);
      expect(added.activities.map((a) => a.id)).toEqual(added.plan.deck);
      expect(added.plan.customActivityIds).toContain(custom.id);
      expect(added.plan.status).toBe("swiping");
      expect(added.plan.finishedIds).toEqual([]);
      expect(added.plan.votes).toEqual({});
      // Свайпы старых карточек на месте — досвайпать только новые.
      for (const caller of [owner, azamat, nurai]) {
        expect(Object.keys(added.plan.swipes[caller.id] ?? {})).toHaveLength(
          deck.length,
        );
      }
      let last = added;
      for (const caller of [owner, azamat, nurai]) {
        last = await swipe(caller, id, extra, "like");
        last = await swipe(caller, id, custom.id, "pass");
      }
      expect(last.plan.status).toBe("results");
      expect(decisionCandidates(last.plan, last.activities)).toEqual({
        pool: [extra],
        source: "matches",
      });
      // После решения добавлять нельзя — сначала отменить его.
      await decide(owner, id, { method: "random" });
      const another = await outsideDeck(owner, last.plan.deck);
      await fails(add(owner, [another]), "CONFLICT");
    });

    it("во время свайпа добавлять нельзя", async () => {
      const { owner, id, started } = await startLive("all");
      const extra = await outsideDeck(owner, started.plan.deck);
      await fails(
        addActivities(owner, id, { activityIds: [extra] }),
        "CONFLICT",
      );
    });

    it("после итогов вступить нельзя, участнику повторный вход не мешает", async () => {
      const { owner, azamat, nurai, id } = await toResults();
      const late = await person("Айжан");
      await fails(act(late, id, "/join"), "CONFLICT");
      const again = await act(azamat, id, "/join");
      expect(again.plan.status).toBe("results");
      expect(again.plan.participantIds).toEqual([
        owner.id,
        azamat.id,
        nurai.id,
      ]);
    });
  });

  describe("новый круг «До даты»", () => {
    // «До даты» на двоих, оба досвайпали всё пасом — результаты до даты.
    const deadlineResults = async () => {
      const owner = await person("Айгерим");
      const azamat = await person("Азамат");
      await api.befriend(owner, azamat);
      const created = await api.call<PlanView>(owner, "POST", "/plans", {
        title: "На выходных",
        mode: "deadline",
        deadline: new Date(NOW + 2 * DAY).toISOString(),
        participantIds: [azamat.id],
        filters: FILTERS,
      });
      const view = await playDeck(created, [
        [owner, ""],
        [azamat, ""],
      ]);
      expect(view.plan.status).toBe("results");
      return { owner, azamat, view, id: view.plan.id };
    };

    it("до даты: своя новая дата заменяет старую; прошедшая — VALIDATION", async () => {
      const { owner, id, view } = await deadlineResults();
      const extra = await outsideDeck(owner, view.plan.deck);
      await fails(
        addActivities(owner, id, {
          activityIds: [extra],
          deadline: new Date(NOW - 1_000).toISOString(),
        }),
        "VALIDATION",
      );
      await fails(
        addActivities(owner, id, { activityIds: [extra], deadline: "завтра" }),
        "VALIDATION",
      );
      const added = await addActivities(owner, id, {
        activityIds: [extra],
        deadline: new Date(NOW + 5 * DAY).toISOString(),
      });
      expect(added.plan.status).toBe("swiping");
      expect(Date.parse(added.plan.deadline ?? "")).toBe(NOW + 5 * DAY);
    });

    it("до даты без новой даты — дата прежняя", async () => {
      const { owner, id, view } = await deadlineResults();
      const extra = await outsideDeck(owner, view.plan.deck);
      const added = await addActivities(owner, id, { activityIds: [extra] });
      expect(Date.parse(added.plan.deadline ?? "")).toBe(NOW + 2 * DAY);
    });

    it("после даты без новой даты — +1 день от «сейчас», свайпы снова принимаются", async () => {
      const { owner, azamat, id, view } = await deadlineResults();
      api.advance(3 * DAY);
      const now = NOW + 3 * DAY;
      const extra = await outsideDeck(owner, view.plan.deck);
      await fails(
        addActivities(owner, id, {
          activityIds: [extra],
          deadline: new Date(now - 1_000).toISOString(),
        }),
        "VALIDATION",
      );
      const added = await addActivities(owner, id, { activityIds: [extra] });
      expect(added.plan.status).toBe("swiping");
      expect(Date.parse(added.plan.deadline ?? "")).toBe(now + DAY);
      await swipe(owner, id, extra, "like");
      const done = await swipe(azamat, id, extra, "like");
      expect(done.plan.status).toBe("results");
    });
  });

  // Y02: дата закрывает план с отстающими так же, как «Показать итоги
  // сейчас», — по долиставшим. Долистал меньше двоих — «Продлить на сутки».
  describe("дата «До даты» и отстающие (Y02)", () => {
    // «До даты» на троих. finished — кто долистал (лайк первой карточки,
    // пас остальным); остальные пасанули только первую.
    const deadlinePlan = async (
      finished: Array<"azamat" | "nurai" | "owner">,
    ) => {
      const people = await trio();
      const created = await api.call<PlanView>(people.owner, "POST", "/plans", {
        title: "Выходные 6–7 декабря",
        mode: "deadline",
        deadline: new Date(NOW + 2 * DAY).toISOString(),
        participantIds: [people.azamat.id, people.nurai.id],
        filters: FILTERS,
      });
      const id = created.plan.id;
      const [first = ""] = created.plan.deck;
      for (const key of ["owner", "azamat", "nurai"] as const) {
        if (finished.includes(key)) {
          await playDeck(created, [[people[key], "L"]]);
        } else {
          await swipe(people[key], id, first, "pass");
        }
      }
      return { ...people, id, first, deck: created.plan.deck };
    };
    // Перемотать за дату и пройтись планировщиком.
    const pastDeadline = async () => {
      api.advance(2 * DAY + 60_000);
      return api.expire();
    };

    it("1 из 3: итогов нет — closedEarly и timedOut, повторный проход ничего не трогает", async () => {
      const { owner, nurai, id, first } = await deadlinePlan(["owner"]);
      expect(await pastDeadline()).toEqual([id]);
      const { plan } = await getPlan(owner, id);
      expect(plan).toMatchObject({
        status: "results",
        closedEarly: true,
        timedOut: true,
        votes: {},
      });
      expect(plan.finishedIds).toEqual([owner.id]);
      expect(isTimedOutWithoutResults(plan)).toBe(true);
      expect(await api.expire()).toEqual([]);
      await fails(swipe(nurai, id, first, "like"), "CONFLICT");
    });

    it("2 из 3: итоги по долиставшим — пас отстающей не мешает «Все за»", async () => {
      const { owner, azamat, nurai, id, first, deck } = await deadlinePlan([
        "owner",
        "azamat",
      ]);
      expect(await pastDeadline()).toEqual([id]);
      const view = await getPlan(nurai, id);
      expect(view.plan).toMatchObject({
        status: "results",
        closedEarly: true,
        timedOut: true,
      });
      expect(sorted(view.plan.finishedIds)).toEqual(
        sorted([owner.id, azamat.id]),
      );
      expect(isTimedOutWithoutResults(view.plan)).toBe(false);
      expect(
        computeMatches(view.plan, view.activities).matches.map(
          (m) => m.activityId,
        ),
      ).toEqual([first]);
      await fails(swipe(nurai, id, deck[1] ?? first, "like"), "CONFLICT");
      // Барабан крутится по тем же итогам.
      const decided = await decide(owner, id, { method: "random" });
      expect(decided.plan.decision?.activityId).toBe(first);
    });

    it("3 из 3: итоги сразу, дата их не трогает и отметок нет", async () => {
      const { owner, id } = await deadlinePlan(["owner", "azamat", "nurai"]);
      expect((await getPlan(owner, id)).plan.status).toBe("results");
      expect(await pastDeadline()).toEqual([]);
      const { plan } = await getPlan(owner, id);
      expect(plan.status).toBe("results");
      expect(plan.closedEarly).toBeUndefined();
      expect(plan.timedOut).toBeUndefined();
    });

    it("«Продлить на сутки»: только организатор, снова колода, повтор ничего не меняет", async () => {
      const { owner, azamat, nurai, id, deck } = await deadlinePlan(["owner"]);
      await pastDeadline();
      const now = NOW + 2 * DAY + 60_000;
      await fails(act(azamat, id, "/extend"), "FORBIDDEN");
      await fails(act(owner, "pl_nope", "/extend"), "NOT_FOUND");
      const extended = await act(owner, id, "/extend");
      expect(extended.plan).toMatchObject({
        status: "swiping",
        finishedIds: [owner.id],
        votes: {},
      });
      expect(Date.parse(extended.plan.deadline ?? "")).toBe(now + DAY);
      expect(extended.plan.closedEarly).toBeUndefined();
      expect(extended.plan.timedOut).toBeUndefined();
      api.advance(60_000);
      const again = await act(owner, id, "/extend");
      expect(again.plan).toEqual(extended.plan);
      expect(await api.expire()).toEqual([]);
      // Отстающие досвайпывают — итоги по всем, без отметок.
      let last = extended;
      for (const caller of [azamat, nurai]) {
        for (const card of deck) last = await swipe(caller, id, card, "pass");
      }
      expect(last.plan.status).toBe("results");
      expect(last.plan.closedEarly).toBeUndefined();
      // Итоги готовы без отстающих — продлевать нечего.
      await fails(act(owner, id, "/extend"), "CONFLICT");
    });

    it("«Продлить» нельзя: «Прямо сейчас», лобби, решённый план", async () => {
      const live = await toResults();
      await fails(act(live.owner, live.id, "/extend"), "CONFLICT");
      const { owner, azamat, id } = await deadlinePlan(["owner", "azamat"]);
      await pastDeadline();
      await decide(owner, id, { method: "random" });
      await fails(act(owner, id, "/extend"), "CONFLICT");
      const lobby = await api.call<PlanView>(owner, "POST", "/plans", {
        title: "Пятница",
        mode: "live",
        participantIds: [azamat.id],
        filters: FILTERS,
      });
      await fails(act(owner, lobby.plan.id, "/extend"), "CONFLICT");
    });
  });
});
