import type { Product } from "@swipeit/core/api/catalog/types";
import type {
  SantaSummary,
  SantaView,
  SantaWard,
} from "@swipeit/core/api/santa/types";
import type { SwipeResponse } from "@swipeit/core/api/wishlist/types";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  type ApiClient,
  type Caller,
  CLIENTS,
  NOW,
  testCatalog,
} from "./client";

// Контрактный тест Тайного Санты (BACKEND.md B11) — по santa.test.ts мока:
// создание, список, вступление, правка до жеребьёвки, жеребьёвка, конверт,
// «Я купил подарок», вишлист подопечного с бюджетом. Ботов нет: вместо них
// тестовые люди с именами, они вступают сами. Только через API — пары мы
// узнаём из ответов самих Сант и проверяем их свойства, а не случайный
// итог. Главное — приватность пар (§4.6, п. 2): у каждого во всех ответах
// только свой подопечный. POST /santa/tick не проверяем: на сервере это
// планировщик (B13), снаружи маршрута нет.
const HOUR = 3600_000;
const DAY = 24 * HOUR;
const GIVEN_AT = "2026-11-25T10:00:00.000Z";

const GAME = {
  title: "Офис, Новый год",
  budget: 2000,
  exchangeDate: "2026-12-28",
};

const STATUS = {
  CONFLICT: 409,
  FORBIDDEN: 403,
  NAME_REQUIRED: 409,
  NOT_FOUND: 404,
  VALIDATION: 400,
} as const;

// Предел игры — 30 человек вместе с организатором.
const MAX_MEMBERS = 30;

const sorted = (ids: readonly string[]) => [...ids].sort();

type AnyView = SantaSummary | SantaView;

describe.each(CLIENTS)("Тайный Санта — %s", (_name, create) => {
  let api: ApiClient;
  let products: Map<string, Product>;
  beforeEach(async () => {
    api = await create();
    products = new Map(
      (await testCatalog()).products.map((product) => [product.id, product]),
    );
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
  // Ещё один друг организатора.
  const friendOf = async (owner: Caller, name: string) => {
    const friend = await person(name);
    await api.befriend(owner, friend);
    return friend;
  };
  const gamePath = (id: string, action = "") =>
    `/santa/${encodeURIComponent(id)}${action}`;
  const createGame = (owner: Caller, body: Record<string, unknown> = {}) =>
    api.call<SantaView>(owner, "POST", "/santa", {
      ...GAME,
      participantIds: [],
      ...body,
    });
  const act = (caller: Caller, id: string, action: string, body?: unknown) =>
    api.call<SantaView>(caller, "POST", gamePath(id, action), body);
  const getGame = (caller: Caller, id: string) =>
    api.call<SantaView>(caller, "GET", gamePath(id));
  const patchGame = (caller: Caller, id: string, body: unknown) =>
    api.call<SantaView>(caller, "PATCH", gamePath(id), body);
  const listGames = (caller: Caller) =>
    api.call<SantaSummary[]>(caller, "GET", "/santa");
  // Игра на троих: организатор позвал двоих, оба вступили сами.
  const gathered = async (body: Record<string, unknown> = {}) => {
    const people = await trio();
    const created = await createGame(people.owner, {
      participantIds: [people.azamat.id, people.nurai.id],
      ...body,
    });
    const id = created.game.id;
    await act(people.azamat, id, "/join");
    const view = await act(people.nurai, id, "/join");
    return { ...people, id, view };
  };
  // То же — и организатор провёл жеребьёвку.
  const drawnGame = async (body: Record<string, unknown> = {}) => {
    const game = await gathered(body);
    const view = await act(game.owner, game.id, "/draw");
    return { ...game, view };
  };
  // Толпа: count человек с именами, не друзья организатору — только по
  // ссылке.
  const crowd = async (count: number) => {
    const people: Caller[] = [];
    for (let index = 1; index <= count; index += 1) {
      people.push(await person(`Гость ${index}`));
    }
    return people;
  };
  // Пары узнаём только из ответов самих Сант: santaId → wardId.
  const wardsOf = async (id: string, callers: readonly Caller[]) => {
    const wards: Record<string, string> = {};
    for (const caller of callers) {
      const ward = (await getGame(caller, id)).me?.ward;
      expect(ward).toBeTruthy();
      wards[caller.id] = ward?.id ?? "";
    }
    return wards;
  };
  // У каждого ровно один подопечный, себе никто не дарит, подопечные все
  // разные — и это ровно те же люди.
  const expectPairs = (
    wards: Record<string, string>,
    participantIds: readonly string[],
  ) => {
    expect(sorted(Object.keys(wards))).toEqual(sorted(participantIds));
    for (const [santa, ward] of Object.entries(wards)) {
      expect(ward).not.toBe(santa);
    }
    expect(sorted(Object.values(wards))).toEqual(sorted(participantIds));
  };
  // Приватность (§4.6, п. 2): в ответе нет пар, нет списков, кто вскрыл и
  // кто купил, у участников — ни слова о подопечных, подопечный (если есть)
  // — только свой и только один.
  const expectOnlyOwnWard = (
    view: AnyView,
    caller: Caller,
    wards: Record<string, string>,
  ) => {
    expect(view.game).not.toHaveProperty("assignments");
    expect(view.game).not.toHaveProperty("openedIds");
    expect(view.game).not.toHaveProperty("boughtIds");
    expect(view.members.every((member) => !("ward" in member))).toBe(true);
    const ward = view.me?.ward ?? null;
    if (ward !== null) expect(ward.id).toBe(wards[caller.id]);
    const json = JSON.stringify(view);
    expect(json).not.toContain("assignments");
    // Подопечный с вишлистом — не больше одного на ответ.
    expect(json.split('"overBudgetCount"').length - 1).toBeLessThanOrEqual(1);
    expect(json.split('"ward"').length - 1).toBeLessThanOrEqual(1);
  };

  describe("создание", () => {
    it("организатор вступил, друзья позваны, роль owner, конверт запечатан", async () => {
      const { owner, azamat, nurai } = await trio();
      const daniyar = await friendOf(owner, "Данияр");
      // Повтор и сам организатор в списке позванных — не ошибка.
      const view = await createGame(owner, {
        participantIds: [azamat.id, nurai.id, daniyar.id, azamat.id, owner.id],
        exclusions: [[azamat.id, nurai.id]],
      });
      expect(view.game).toMatchObject({
        ...GAME,
        ownerId: owner.id,
        status: "gathering",
        participantIds: [owner.id],
        invitedIds: [azamat.id, nurai.id, daniyar.id],
        exclusions: [[azamat.id, nurai.id]],
      });
      expect(view.game.drawAt).toBeUndefined();
      expect(view.game.drawnAt).toBeUndefined();
      expect(Date.parse(view.game.createdAt)).toBe(NOW);
      expect(view.role).toBe("owner");
      expect(view.me).toEqual({
        envelope: "sealed",
        bought: false,
        ward: null,
      });
      expect(view.openedCount).toBe(0);
      expect(view.boughtCount).toBe(0);
      expect(
        view.members.map((m) => [m.id, m.name, m.joined, m.hasWishlist]),
      ).toEqual([
        [owner.id, "Айгерим", true, false],
        [azamat.id, "Азамат", false, false],
        [nurai.id, "Нурай", false, false],
        [daniyar.id, "Данияр", false, false],
      ]);
      // Пока вступил один организатор — провести нельзя.
      expect(view.drawIssue).toEqual(expect.any(String));
      expect(view.drawIssue).not.toBe("");
    });

    it("жеребьёвка по дате: drawAt сохраняется", async () => {
      const owner = await person("Айгерим");
      const drawAt = new Date(NOW + DAY).toISOString();
      const view = await createGame(owner, { drawMode: "date", drawAt });
      expect(Date.parse(view.game.drawAt ?? "")).toBe(NOW + DAY);
      // В ручном режиме drawAt из тела не сохраняется.
      const manual = await createGame(owner, { drawMode: "manual", drawAt });
      expect(manual.game.drawAt).toBeUndefined();
    });

    it("ошибки ввода: название, бюджет, даты, исключения — VALIDATION", async () => {
      const { owner, azamat, nurai } = await trio();
      const stranger = await person("Бермет");
      const friends = { participantIds: [azamat.id, nurai.id] };
      await fails(createGame(owner, { title: "  " }), "VALIDATION");
      await fails(createGame(owner, { title: "я".repeat(61) }), "VALIDATION");
      await fails(createGame(owner, { budget: 0 }), "VALIDATION");
      await fails(createGame(owner, { budget: 1500.5 }), "VALIDATION");
      await fails(createGame(owner, { budget: "2000" }), "VALIDATION");
      await fails(api.call(owner, "POST", "/santa", { ...GAME }), "VALIDATION");
      // Даты: обмен — не в прошлом, жеребьёвка — в будущем и до обмена.
      await fails(
        createGame(owner, { exchangeDate: "2026-11-01" }),
        "VALIDATION",
      );
      await fails(
        createGame(owner, { exchangeDate: "28.12.2026" }),
        "VALIDATION",
      );
      await fails(createGame(owner, { drawMode: "date" }), "VALIDATION");
      await fails(
        createGame(owner, { drawMode: "date", drawAt: "завтра" }),
        "VALIDATION",
      );
      await fails(
        createGame(owner, {
          drawMode: "date",
          drawAt: new Date(NOW - HOUR).toISOString(),
        }),
        "VALIDATION",
      );
      await fails(
        createGame(owner, {
          drawMode: "date",
          drawAt: new Date(Date.UTC(2027, 0, 5, 6)).toISOString(),
        }),
        "VALIDATION",
      );
      // Исключения: оба — в игре или позваны, не сам с собой.
      await fails(
        createGame(owner, {
          ...friends,
          exclusions: [[azamat.id, stranger.id]],
        }),
        "VALIDATION",
      );
      await fails(
        createGame(owner, { ...friends, exclusions: [[azamat.id, azamat.id]] }),
        "VALIDATION",
      );
      // Ошибочные попытки ничего не создали.
      expect(await listGames(owner)).toEqual([]);
    });

    it("невозможные исключения — CONFLICT сразу, до жеребьёвки", async () => {
      const { owner, azamat, nurai } = await trio();
      const error = await createGame(owner, {
        participantIds: [azamat.id, nurai.id],
        exclusions: [
          [azamat.id, owner.id],
          [nurai.id, azamat.id],
        ],
      }).catch((caught: unknown) => caught);
      expect(error).toMatchObject({ code: "CONFLICT", status: 409 });
      expect((error as Error).message).not.toBe("");
      expect(await listGames(owner)).toEqual([]);
    });

    it("позвать кнопкой можно только друзей с именем — остальных VALIDATION", async () => {
      const owner = await person("Айгерим");
      const friend = await friendOf(owner, "Азамат");
      const stranger = await person("Бермет");
      const { caller: nameless } = await api.newUser();
      await api.befriend(owner, nameless);
      await fails(
        createGame(owner, { participantIds: [friend.id, stranger.id] }),
        "VALIDATION",
      );
      await fails(
        createGame(owner, { participantIds: ["u_nobody"] }),
        "VALIDATION",
      );
      await fails(
        createGame(owner, { participantIds: [nameless.id] }),
        "VALIDATION",
      );
      const view = await createGame(owner, { participantIds: [friend.id] });
      expect(view.game.invitedIds).toEqual([friend.id]);
      const list = await listGames(owner);
      expect(list.map((item) => item.game.id)).toEqual([view.game.id]);
    });

    it("без имени — NAME_REQUIRED", async () => {
      const { caller: nameless } = await api.newUser();
      await fails(createGame(nameless), "NAME_REQUIRED");
    });
  });

  describe("список игр", () => {
    it("у организатора, позванного и участника, новые сверху; чужому — пусто", async () => {
      const { owner, azamat, nurai } = await trio();
      const first = await createGame(owner, {
        title: "Первая",
        participantIds: [azamat.id, nurai.id],
      });
      api.advance(60_000);
      const second = await createGame(owner, {
        title: "Вторая",
        participantIds: [nurai.id],
      });
      await act(azamat, first.game.id, "/join");

      const mine = await listGames(owner);
      expect(mine.map((item) => item.game.id)).toEqual([
        second.game.id,
        first.game.id,
      ]);
      expect(mine.map((item) => item.role)).toEqual(["owner", "owner"]);
      expect(mine[0]?.me).toEqual({
        envelope: "sealed",
        bought: false,
        ward: null,
      });
      expect(Date.parse(mine[0]?.game.createdAt ?? "")).toBe(NOW + 60_000);
      expect(Date.parse(mine[1]?.game.createdAt ?? "")).toBe(NOW);

      const forNurai = await listGames(nurai);
      expect(forNurai.map((item) => item.game.id)).toEqual([
        second.game.id,
        first.game.id,
      ]);
      expect(forNurai.map((item) => item.role)).toEqual(["invited", "invited"]);
      expect(forNurai.map((item) => item.me)).toEqual([null, null]);

      const forAzamat = await listGames(azamat);
      expect(forAzamat.map((item) => [item.game.id, item.role])).toEqual([
        [first.game.id, "participant"],
      ]);
      expect(forAzamat[0]?.me?.envelope).toBe("sealed");

      const stranger = await person("Бермет");
      expect(await listGames(stranger)).toEqual([]);
    });
  });

  describe("игра глазами разных людей", () => {
    it("организатор, участник, позванный и чужой: роль и «моё в игре»", async () => {
      const { owner, azamat, nurai } = await trio();
      const created = await createGame(owner, {
        participantIds: [azamat.id, nurai.id],
      });
      const id = created.game.id;
      await act(azamat, id, "/join");
      const stranger = await person("Бермет");

      const forOwner = await getGame(owner, id);
      expect(forOwner.role).toBe("owner");
      expect(forOwner.me).toEqual({
        envelope: "sealed",
        bought: false,
        ward: null,
      });
      const forAzamat = await getGame(azamat, id);
      expect(forAzamat.role).toBe("participant");
      expect(forAzamat.me).toEqual({
        envelope: "sealed",
        bought: false,
        ward: null,
      });
      const forNurai = await getGame(nurai, id);
      expect(forNurai.role).toBe("invited");
      expect(forNurai.me).toBeNull();
      // Чужой видит игру до вступления — экран приглашения по ссылке.
      const forStranger = await getGame(stranger, id);
      expect(forStranger.role).toBe("guest");
      expect(forStranger.me).toBeNull();
      expect(forStranger.game).toMatchObject({
        id,
        title: GAME.title,
        ownerId: owner.id,
        status: "gathering",
      });
      expect(forStranger.members.map((m) => [m.name, m.joined])).toEqual([
        ["Айгерим", true],
        ["Азамат", true],
        ["Нурай", false],
      ]);
      await fails(getGame(owner, "sg_nope"), "NOT_FOUND");
    });
  });

  describe("правка до жеребьёвки", () => {
    it("только организатор: название, бюджет, даты, исключения", async () => {
      const { owner, azamat, nurai } = await trio();
      const daniyar = await friendOf(owner, "Данияр");
      const timur = await friendOf(owner, "Тимур");
      // Вторая игра того же организатора правкой не задевается.
      const { game: other } = await createGame(owner);
      // Позвал четверых, чтобы исключения было из кого выбрать.
      const bigger = await createGame(owner, {
        participantIds: [azamat.id, nurai.id, daniyar.id, timur.id],
      });
      const bigId = bigger.game.id;
      await act(azamat, bigId, "/join");
      await fails(patchGame(azamat, bigId, { budget: 5000 }), "FORBIDDEN");
      await fails(patchGame(nurai, bigId, { budget: 5000 }), "FORBIDDEN");
      const stranger = await person("Бермет");
      await fails(patchGame(stranger, bigId, { budget: 5000 }), "FORBIDDEN");
      await fails(patchGame(owner, "sg_nope", { budget: 5000 }), "NOT_FOUND");

      const drawAt = new Date(NOW + 2 * HOUR).toISOString();
      const patched = await patchGame(owner, bigId, {
        title: "Офис",
        budget: 3000,
        exchangeDate: "2026-12-30",
        drawMode: "date",
        drawAt,
        exclusions: [
          [daniyar.id, timur.id],
          [timur.id, daniyar.id],
        ],
      });
      expect(patched.role).toBe("owner");
      expect(patched.game).toMatchObject({
        title: "Офис",
        budget: 3000,
        exchangeDate: "2026-12-30",
        status: "gathering",
      });
      expect(Date.parse(patched.game.drawAt ?? "")).toBe(NOW + 2 * HOUR);
      // Пара в обратную сторону — та же пара.
      expect(patched.game.exclusions.map((pair) => sorted(pair))).toEqual([
        sorted([daniyar.id, timur.id]),
      ]);
      // Изменения видны всем.
      expect((await getGame(azamat, bigId)).game).toMatchObject({
        title: "Офис",
        budget: 3000,
      });

      const manual = await patchGame(owner, bigId, { drawMode: "manual" });
      expect(manual.game.drawAt).toBeUndefined();

      // Ошибки ввода.
      await fails(patchGame(owner, bigId, { budget: 0 }), "VALIDATION");
      await fails(patchGame(owner, bigId, { title: " " }), "VALIDATION");
      await fails(patchGame(owner, bigId, { drawMode: "date" }), "VALIDATION");
      await fails(
        patchGame(owner, bigId, { exchangeDate: "2026-11-01" }),
        "VALIDATION",
      );
      await fails(
        patchGame(owner, bigId, {
          drawMode: "date",
          drawAt: new Date(NOW - HOUR).toISOString(),
        }),
        "VALIDATION",
      );
      await fails(
        patchGame(owner, bigId, { exclusions: [[azamat.id, stranger.id]] }),
        "VALIDATION",
      );
      // Азамату некому дарить — CONFLICT.
      await fails(
        patchGame(owner, bigId, {
          exclusions: [
            [azamat.id, owner.id],
            [azamat.id, nurai.id],
            [azamat.id, daniyar.id],
            [azamat.id, timur.id],
          ],
        }),
        "CONFLICT",
      );
      // Ошибки ничего не записали.
      const after = await getGame(owner, bigId);
      expect(after.game).toMatchObject({ title: "Офис", budget: 3000 });
      expect(after.game.exclusions).toHaveLength(1);
      expect(after.game.drawAt).toBeUndefined();
      expect((await getGame(owner, other.id)).game).toMatchObject(GAME);
    });

    it("R03: после жеребьёвки — только дата обмена, остальное CONFLICT", async () => {
      const { owner, azamat, id } = await drawnGame();
      const wardBefore = (await getGame(azamat, id)).me?.ward?.id;
      expect(wardBefore).toEqual(expect.any(String));
      const moved = await patchGame(owner, id, { exchangeDate: "2026-12-27" });
      expect(moved.game).toMatchObject({
        exchangeDate: "2026-12-27",
        status: "drawn",
      });
      await expect(
        patchGame(owner, id, { budget: 1000 }),
      ).rejects.toMatchObject({
        code: "CONFLICT",
        status: STATUS.CONFLICT,
        message: "Жеребьёвка уже прошла — менять можно только дату обмена",
      });
      // Вместе с датой — тоже нельзя, и дата не записалась.
      await fails(
        patchGame(owner, id, { exchangeDate: "2026-12-26", title: "Офис" }),
        "CONFLICT",
      );
      await fails(
        patchGame(owner, id, { exchangeDate: "2026-11-01" }),
        "VALIDATION",
      );
      // Не организатору — по-прежнему FORBIDDEN.
      await fails(
        patchGame(azamat, id, { exchangeDate: "2026-12-26" }),
        "FORBIDDEN",
      );
      const after = (await getGame(azamat, id)).game;
      expect(after).toMatchObject({
        budget: GAME.budget,
        title: GAME.title,
        exchangeDate: "2026-12-27",
      });
      // Пары не поменялись: у Азамата тот же подопечный.
      expect((await getGame(azamat, id)).me?.ward?.id).toBe(wardBefore);
    });

    it("R03: исключение между вступившими по ссылке соблюдается — 20 жеребьёвок", async () => {
      for (let run = 0; run < 20; run += 1) {
        const owner = await person("Айгерим");
        const friend = await friendOf(owner, "Азамат");
        const [first, second] = await crowd(2);
        if (!first || !second) throw new Error("нет гостей");
        const { game } = await createGame(owner, {
          participantIds: [friend.id],
        });
        await act(friend, game.id, "/join");
        // Пришли по ссылке — организатор их не звал.
        await act(first, game.id, "/join");
        await act(second, game.id, "/join");
        const patched = await patchGame(owner, game.id, {
          exclusions: [[first.id, second.id]],
        });
        expect(patched.game.exclusions).toEqual([[first.id, second.id]]);
        expect(patched.drawIssue).toBeNull();
        await act(owner, game.id, "/draw");
        const everyone = [owner, friend, first, second];
        const wards = await wardsOf(game.id, everyone);
        expectPairs(
          wards,
          everyone.map((caller) => caller.id),
        );
        expect(wards[first.id]).not.toBe(second.id);
        expect(wards[second.id]).not.toBe(first.id);
      }
      // 20 жеребьёвок на сервере — дольше 5 с по умолчанию.
    }, 60_000);

    it("R03: невозможные исключения — CONFLICT, игра не изменилась", async () => {
      const { owner, azamat, nurai, id } = await gathered();
      // Втроём Азамат и Нурай не дарят друг другу — оба могут дарить только
      // организатору.
      await fails(
        patchGame(owner, id, { exclusions: [[azamat.id, nurai.id]] }),
        "CONFLICT",
      );
      expect((await getGame(owner, id)).game.exclusions).toEqual([]);
    });

    it("R03: бюджет или дата обмена поменялись — тост участникам, не организатору", async () => {
      const { owner, azamat, nurai, id } = await gathered();
      const toasts = () =>
        api
          .events()
          .flatMap((event) => (event.type === "toast" ? [event] : []));
      await patchGame(owner, id, { title: "Офис" });
      expect(toasts()).toEqual([]);
      await patchGame(owner, id, { budget: 3000 });
      const text =
        "Организатор изменил условия «Офис»: бюджет 3 000 сом, обмен 28 декабря";
      expect(toasts()).toEqual(
        expect.arrayContaining([
          { type: "toast", text, forUserId: azamat.id },
          { type: "toast", text, forUserId: nurai.id },
        ]),
      );
      expect(toasts()).toHaveLength(2);
      expect(toasts().some((event) => event.forUserId === owner.id)).toBe(
        false,
      );
    });
  });

  describe("вступление", () => {
    it("позванный вступает, чужой — по ссылке, повтор ничего не меняет", async () => {
      const { owner, azamat, nurai } = await trio();
      const created = await createGame(owner, {
        participantIds: [azamat.id, nurai.id],
      });
      const id = created.game.id;
      const joined = await act(azamat, id, "/join");
      expect(joined.role).toBe("participant");
      expect(joined.game.participantIds).toEqual([owner.id, azamat.id]);
      expect(joined.game.invitedIds).toEqual([nurai.id]);
      expect(joined.me).toEqual({
        envelope: "sealed",
        bought: false,
        ward: null,
      });
      expect(joined.members.map((m) => [m.id, m.joined])).toEqual([
        [owner.id, true],
        [azamat.id, true],
        [nurai.id, false],
      ]);

      // Гость — не друг организатора: только по ссылке.
      const guest = await person("Айжан");
      const viaLink = await act(guest, id, "/join");
      expect(viaLink.role).toBe("participant");
      expect(viaLink.game.participantIds).toEqual([
        owner.id,
        azamat.id,
        guest.id,
      ]);
      expect(viaLink.game.invitedIds).toEqual([nurai.id]);

      // Повтор и «вступление» организатора ничего не меняют.
      const again = await act(guest, id, "/join");
      expect(again.game.participantIds).toEqual([
        owner.id,
        azamat.id,
        guest.id,
      ]);
      const ownerAgain = await act(owner, id, "/join");
      expect(ownerAgain.role).toBe("owner");
      expect(ownerAgain.game.participantIds).toEqual([
        owner.id,
        azamat.id,
        guest.id,
      ]);
      // Игра — в списке гостя.
      const list = await listGames(guest);
      expect(list.map((item) => [item.game.id, item.role])).toEqual([
        [id, "participant"],
      ]);
      // Трое вступили — провести можно, хоть Нурай ещё позвана.
      expect((await getGame(owner, id)).drawIssue).toBeNull();
    });

    it("без имени — NAME_REQUIRED; неизвестная игра — NOT_FOUND", async () => {
      const owner = await person("Айгерим");
      const { game } = await createGame(owner);
      const { caller: nameless } = await api.newUser();
      await fails(act(nameless, game.id, "/join"), "NAME_REQUIRED");
      await fails(act(owner, "sg_nope", "/join"), "NOT_FOUND");
      // На битую ссылку имя не спрашиваем.
      await fails(act(nameless, "sg_nope", "/join"), "NOT_FOUND");
      expect((await getGame(owner, game.id)).game.participantIds).toEqual([
        owner.id,
      ]);
    });

    it("после жеребьёвки вступить нельзя — CONFLICT; участнику повтор можно", async () => {
      const { owner, azamat, id } = await drawnGame();
      const late = await person("Бакыт");
      await fails(act(late, id, "/join"), "CONFLICT");
      const again = await act(azamat, id, "/join");
      expect(again.role).toBe("participant");
      expect(again.game.participantIds).toHaveLength(3);
      expect((await getGame(owner, id)).game.participantIds).not.toContain(
        late.id,
      );
    });

    it(`не больше ${MAX_MEMBERS} человек: тридцать первый — CONFLICT`, async () => {
      const owner = await person("Айгерим");
      const { game } = await createGame(owner);
      // 29 вступают по ссылке — вместе с организатором ровно 30.
      const people = await crowd(MAX_MEMBERS);
      const others = people.slice(0, MAX_MEMBERS - 1);
      const last = people[MAX_MEMBERS - 1];
      let view: SantaView | undefined;
      for (const caller of others) {
        view = await act(caller, game.id, "/join");
      }
      expect(view?.game.participantIds).toHaveLength(MAX_MEMBERS);
      expect(view?.game.participantIds[0]).toBe(owner.id);
      if (last === undefined) throw new Error("нет тридцать первого");
      await fails(act(last, game.id, "/join"), "CONFLICT");
      const after = await getGame(owner, game.id);
      expect(after.game.participantIds).toHaveLength(MAX_MEMBERS);
      expect(after.game.participantIds).not.toContain(last.id);
      // Уже вступивший повторяет — не ошибка.
      const first = others[0];
      if (first) {
        const again = await act(first, game.id, "/join");
        expect(again.game.participantIds).toHaveLength(MAX_MEMBERS);
      }
    }, 30_000);
  });

  describe("жеребьёвка", () => {
    it("только организатор и когда вступили хотя бы трое", async () => {
      const { owner, azamat, nurai } = await trio();
      const created = await createGame(owner, {
        participantIds: [azamat.id, nurai.id],
      });
      const id = created.game.id;
      const joined = await act(azamat, id, "/join");
      // Нурай позвана, но не вступила — ждём её. Причину видит только
      // организатор (S05).
      expect(joined.drawIssue).toBeNull();
      expect((await getGame(owner, id)).drawIssue).toEqual(expect.any(String));
      await fails(act(azamat, id, "/draw"), "FORBIDDEN");
      await fails(act(nurai, id, "/draw"), "FORBIDDEN");
      await fails(act(owner, id, "/draw"), "CONFLICT");
      await fails(act(owner, "sg_nope", "/draw"), "NOT_FOUND");
      // Ошибка ничего не записала.
      const after = await getGame(owner, id);
      expect(after.game.status).toBe("gathering");
      expect(after.game.drawnAt).toBeUndefined();
      expect(after.me?.ward).toBeNull();
    });

    it("исключения среди вступивших не сходятся — CONFLICT с текстом drawIssue", async () => {
      // Вчетвером пары сходятся, а из вступивших троих — нет: Азамат и
      // Нурай могут дарить только организатору.
      const { owner, azamat, nurai } = await trio();
      const bekzat = await friendOf(owner, "Бекзат");
      const created = await createGame(owner, {
        participantIds: [azamat.id, nurai.id, bekzat.id],
        exclusions: [[azamat.id, nurai.id]],
      });
      const id = created.game.id;
      await act(azamat, id, "/join");
      expect((await act(nurai, id, "/join")).drawIssue).toBeNull();
      const view = await getGame(owner, id);
      expect(view.drawIssue).toEqual(expect.any(String));
      expect(view.drawIssue).not.toBe("");
      await expect(act(owner, id, "/draw")).rejects.toMatchObject({
        code: "CONFLICT",
        status: 409,
        message: view.drawIssue,
      });
      expect((await getGame(owner, id)).game.status).toBe("gathering");
      // Бекзат вступил — пары сходятся, исключение соблюдено.
      await act(bekzat, id, "/join");
      expect((await getGame(owner, id)).drawIssue).toBeNull();
      const drawn = await act(owner, id, "/draw");
      expect(drawn.game.status).toBe("drawn");
      const wards = await wardsOf(id, [owner, azamat, nurai, bekzat]);
      expectPairs(wards, [owner.id, azamat.id, nurai.id, bekzat.id]);
      expect(wards[azamat.id]).not.toBe(nurai.id);
      expect(wards[nurai.id]).not.toBe(azamat.id);
    });

    it("у каждого ровно один подопечный, себе никто не дарит, позванные выбывают", async () => {
      const { owner, azamat, nurai } = await trio();
      const daniyar = await friendOf(owner, "Данияр");
      const bekzat = await friendOf(owner, "Бекзат");
      const created = await createGame(owner, {
        participantIds: [azamat.id, nurai.id, daniyar.id, bekzat.id],
      });
      const id = created.game.id;
      // Бекзат так и не вступил.
      for (const caller of [azamat, nurai, daniyar]) {
        await act(caller, id, "/join");
      }
      api.advance(60_000);
      const view = await act(owner, id, "/draw");
      expect(view.game.status).toBe("drawn");
      expect(Date.parse(view.game.drawnAt ?? "")).toBe(NOW + 60_000);
      expect(view.game.invitedIds).toEqual([]);
      expect(view.members.map((m) => m.id)).toEqual([
        owner.id,
        azamat.id,
        nurai.id,
        daniyar.id,
      ]);
      expect(view.members.every((m) => m.joined)).toBe(true);
      expect(view.drawIssue).toBeNull();
      expect(view.role).toBe("owner");
      expect(view.me?.envelope).toBe("ready");
      expect(view.me?.bought).toBe(false);
      const everyone = [owner, azamat, nurai, daniyar];
      const wards = await wardsOf(id, everyone);
      expectPairs(
        wards,
        everyone.map((caller) => caller.id),
      );
      // Ответ жеребьёвки — тот же подопечный, что потом в GET.
      expect(view.me?.ward?.id).toBe(wards[owner.id]);
      // Выбывший — больше не в игре: роль гостя, в списке игры нет.
      const forBekzat = await getGame(bekzat, id);
      expect(forBekzat.role).toBe("guest");
      expect(forBekzat.me).toBeNull();
      expect(await listGames(bekzat)).toEqual([]);
      await fails(act(bekzat, id, "/join"), "CONFLICT");
      await fails(act(bekzat, id, "/open"), "FORBIDDEN");
      // Второй раз — CONFLICT, пары не меняются.
      await fails(act(owner, id, "/draw"), "CONFLICT");
      expect(await wardsOf(id, everyone)).toEqual(wards);
    });

    it("два одновременных «Провести жеребьёвку» — одна жеребьёвка, второй CONFLICT", async () => {
      const { owner, azamat, nurai, id } = await gathered();
      const results = await Promise.allSettled([
        act(owner, id, "/draw"),
        act(owner, id, "/draw"),
      ]);
      const fulfilled = results.filter((r) => r.status === "fulfilled");
      const rejected = results.flatMap((r) =>
        r.status === "rejected" ? [r.reason as unknown] : [],
      );
      expect(fulfilled).toHaveLength(1);
      expect(rejected).toEqual([
        expect.objectContaining({ code: "CONFLICT", status: 409 }),
      ]);
      const winner = fulfilled[0];
      const wards = await wardsOf(id, [owner, azamat, nurai]);
      expectPairs(wards, [owner.id, azamat.id, nurai.id]);
      if (winner?.status === "fulfilled") {
        expect(winner.value.me?.ward?.id).toBe(wards[owner.id]);
      }
    });
  });

  describe("выйти и убрать до жеребьёвки (Q05)", () => {
    it("участник выходит: нет в участниках и исключениях; повтор ничего не меняет; организатор — FORBIDDEN", async () => {
      const { owner, azamat, nurai, id } = await gathered();
      // Четвёртый — по ссылке: с тремя исключение сделало бы пары
      // невозможными.
      const [bakyt] = await crowd(1);
      await act(bakyt as Caller, id, "/join");
      await patchGame(owner, id, { exclusions: [[azamat.id, nurai.id]] });
      const left = await act(azamat, id, "/leave");
      expect(left.game.participantIds).toEqual([
        owner.id,
        nurai.id,
        (bakyt as Caller).id,
      ]);
      expect(left.game.exclusions).toEqual([]);
      expect(left.role).toBe("guest");
      const again = await act(azamat, id, "/leave");
      expect(again.game.participantIds).toHaveLength(3);
      await fails(act(owner, id, "/leave"), "FORBIDDEN");
      // Вышел сам — может вернуться.
      const back = await act(azamat, id, "/join");
      expect(back.game.participantIds).toContain(azamat.id);
    });

    it("организатор убирает: убранный не может вступить снова; не организатор — FORBIDDEN", async () => {
      const { owner, azamat, nurai, id } = await gathered();
      await fails(
        api.call(azamat, "DELETE", gamePath(id, `/members/${nurai.id}`)),
        "FORBIDDEN",
      );
      await fails(
        api.call(owner, "DELETE", gamePath(id, `/members/${owner.id}`)),
        "VALIDATION",
      );
      const removed = await api.call<SantaView>(
        owner,
        "DELETE",
        gamePath(id, `/members/${nurai.id}`),
      );
      expect(removed.game.participantIds).toEqual([owner.id, azamat.id]);
      expect(JSON.stringify(removed.game)).not.toContain("removedIds");
      await fails(act(nurai, id, "/join"), "CONFLICT");
      // Что убрали, знает только сам убранный (Z01).
      expect((await getGame(nurai, id)).removed).toBe(true);
      expect(removed.removed).toBeUndefined();
      expect((await getGame(azamat, id)).removed).toBeUndefined();
    });

    it("после жеребьёвки — CONFLICT и для выхода, и для «Убрать»", async () => {
      const { owner, azamat, nurai, id } = await drawnGame();
      await fails(act(azamat, id, "/leave"), "CONFLICT");
      await fails(
        api.call(owner, "DELETE", gamePath(id, `/members/${nurai.id}`)),
        "CONFLICT",
      );
    });
  });

  describe("R05: убрать участника после жеребьёвки", () => {
    it("игра на 5: Санта убранного получает его подопечного, письмо снова запечатано; остальные пары те же; убранный не вернётся", async () => {
      const { owner, azamat, nurai, id } = await gathered();
      const extra = await crowd(2);
      for (const caller of extra) await act(caller, id, "/join");
      const everyone = [owner, azamat, nurai, ...extra];
      await act(owner, id, "/draw");
      const pairs = new Map<string, string>();
      for (const caller of everyone) {
        await act(caller, id, "/open");
        const ward = (await getGame(caller, id)).me?.ward?.id ?? "";
        pairs.set(caller.id, ward);
        await act(caller, id, "/bought", { bought: true });
      }
      // Убираем того, кто не во взаимной паре (A↔B): там Санта остаётся
      // без подопечного — это случай Q05, а здесь — новое письмо.
      const santaOf = (id: string) =>
        [...pairs].find(([, ward]) => ward === id)?.[0];
      const leaver = everyone.find(
        (caller) =>
          caller !== owner && pairs.get(caller.id) !== santaOf(caller.id),
      ) as Caller;
      const santaId = santaOf(leaver.id);
      const santa = everyone.find((caller) => caller.id === santaId) as Caller;
      await api.call(owner, "DELETE", gamePath(id, `/members/${leaver.id}`));
      const view = await getGame(santa, id);
      expect(view.me?.envelope).toBe("ready");
      expect(view.me?.bought).toBe(false);
      const opened = await act(santa, id, "/open");
      expect(opened.me?.ward?.id).toBe(pairs.get(leaver.id));
      for (const caller of everyone) {
        if (caller === santa || caller === leaver) continue;
        expect((await getGame(caller, id)).me?.ward?.id).toBe(
          pairs.get(caller.id),
        );
      }
      expect(view.game.participantIds).not.toContain(leaver.id);
      await fails(act(leaver, id, "/join"), "CONFLICT");
    }, 60_000);

    it("игра на 3 после жеребьёвки — убрать нельзя: останется меньше троих", async () => {
      const { owner, azamat, id } = await drawnGame();
      await fails(
        api.call(owner, "DELETE", gamePath(id, `/members/${azamat.id}`)),
        "CONFLICT",
      );
    });
  });

  describe("S04: передать роль организатора", () => {
    const handOver = (caller: Caller, id: string, userId: string) =>
      act(caller, id, "/owner", { userId });
    const toasts = () =>
      api.events().flatMap((event) => (event.type === "toast" ? [event] : []));

    it("до жеребьёвки: у нового owner, у прежнего participant; тост новому; исключения — новому", async () => {
      const { owner, azamat, nurai, id } = await gathered();
      const bakyt = await friendOf(owner, "Бакыт");
      await act(bakyt, id, "/join");
      await patchGame(owner, id, { exclusions: [[azamat.id, bakyt.id]] });
      const before = toasts().length;

      const after = await handOver(owner, id, nurai.id);
      expect(after.role).toBe("participant");
      expect(after.game.ownerId).toBe(nurai.id);
      // Прежнему организатору исключения больше не видны (S05).
      expect(after.game.exclusions).toEqual([]);
      expect(after.drawIssue).toBeNull();
      // Организатор — первым в списке участников.
      expect(after.members[0]?.id).toBe(nurai.id);
      expect(sorted(after.game.participantIds)).toEqual(
        sorted([owner.id, azamat.id, nurai.id, bakyt.id]),
      );

      const forNew = await getGame(nurai, id);
      expect(forNew.role).toBe("owner");
      expect(forNew.game.exclusions).toEqual([[azamat.id, bakyt.id]]);
      expect(
        (await getGame(azamat, id)).game.exclusions,
        "участнику исключения по-прежнему не видны",
      ).toEqual([]);
      expect(toasts().slice(before)).toEqual([
        {
          type: "toast",
          text: "Теперь ты организатор игры «Офис, Новый год»",
          forUserId: nurai.id,
        },
      ]);

      // Прежний организатор — участник: условия не меняет, но может выйти.
      await fails(patchGame(owner, id, { budget: 3000 }), "FORBIDDEN");
      await fails(handOver(owner, id, azamat.id), "FORBIDDEN");
      const left = await act(owner, id, "/leave");
      expect(left.role).toBe("guest");
      expect(left.game.participantIds).not.toContain(owner.id);
      // Новый организатор ведёт игру: правка (с тремя исключение сделало бы
      // пары невозможными — снимаем) и жеребьёвка.
      const edited = await patchGame(nurai, id, {
        budget: 3000,
        exclusions: [],
      });
      expect(edited.game.budget).toBe(3000);
      const drawn = await act(nurai, id, "/draw");
      expect(drawn.game.status).toBe("drawn");
      expect(drawn.role).toBe("owner");
    });

    it("не организатор — FORBIDDEN; себе, позванному, чужому и неизвестному — VALIDATION", async () => {
      const { owner, azamat, nurai, id } = await gathered();
      const invited = await friendOf(owner, "Данияр");
      // Позвать после создания нельзя — новая игра с позванным.
      const other = await createGame(owner, { participantIds: [invited.id] });
      const [stranger] = await crowd(1);

      await fails(handOver(azamat, id, nurai.id), "FORBIDDEN");
      await fails(handOver(stranger as Caller, id, nurai.id), "FORBIDDEN");
      await fails(handOver(owner, id, owner.id), "VALIDATION");
      await fails(handOver(owner, id, (stranger as Caller).id), "VALIDATION");
      await fails(handOver(owner, id, "u_nobody"), "VALIDATION");
      await fails(act(owner, id, "/owner", {}), "VALIDATION");
      await fails(handOver(owner, other.game.id, invited.id), "VALIDATION");
      await fails(handOver(owner, "sg_nope", nurai.id), "NOT_FOUND");
      // Ничего не поменялось.
      expect((await getGame(owner, id)).game.ownerId).toBe(owner.id);
    });

    it("после жеребьёвки: пары те же, новый организатор видит только своего подопечного и может убрать участника", async () => {
      const { owner, azamat, nurai, id } = await gathered();
      const extra = await crowd(2);
      for (const caller of extra) await act(caller, id, "/join");
      const everyone = [owner, azamat, nurai, ...extra];
      await act(owner, id, "/draw");
      const wards = await wardsOf(id, everyone);

      const after = await handOver(owner, id, azamat.id);
      expect(after.role).toBe("participant");
      expect(after.me?.ward?.id).toBe(wards[owner.id]);
      expectOnlyOwnWard(after, owner, wards);
      // Пары не изменились — у каждого тот же подопечный.
      expect(await wardsOf(id, everyone)).toEqual(wards);
      const views: AnyView[] = [
        await getGame(azamat, id),
        ...(await listGames(azamat)),
      ];
      for (const view of views) {
        expect(view.role).toBe("owner");
        expectOnlyOwnWard(view, azamat, wards);
      }
      // После жеребьёвки бывший организатор выйти не может — как участник.
      await fails(act(owner, id, "/leave"), "CONFLICT");
      // Новый организатор может убрать участника (R05) — того, кто не дарит
      // ему и кому не дарит он: тогда его письмо не меняется.
      const leaver = everyone.find(
        (caller) =>
          caller !== azamat &&
          wards[azamat.id] !== caller.id &&
          wards[caller.id] !== azamat.id,
      ) as Caller;
      const removed = await api.call<SantaView>(
        azamat,
        "DELETE",
        gamePath(id, `/members/${leaver.id}`),
      );
      expect(removed.game.participantIds).not.toContain(leaver.id);
      expect(removed.role).toBe("owner");
      expectOnlyOwnWard(removed, azamat, wards);
    }, 60_000);
  });

  describe("конверт и «Я купил подарок»", () => {
    it("до жеребьёвки и не участнику — нельзя; «Купил» — только после вскрытия", async () => {
      const { owner, azamat, id } = await gathered();
      await fails(act(owner, id, "/open"), "CONFLICT");
      await fails(act(azamat, id, "/bought"), "CONFLICT");
      await fails(act(owner, "sg_nope", "/open"), "NOT_FOUND");
      await act(owner, id, "/draw");
      const stranger = await person("Бакыт");
      await fails(act(stranger, id, "/open"), "FORBIDDEN");
      await fails(act(stranger, id, "/bought"), "FORBIDDEN");
      await fails(act(owner, id, "/bought"), "CONFLICT");
      await fails(act(owner, id, "/bought", { bought: true }), "CONFLICT");
      const view = await getGame(owner, id);
      expect(view.me?.bought).toBe(false);
      expect(view.boughtCount).toBe(0);
    });

    it("вскрытие сохраняется, повтор ничего не меняет", async () => {
      const { owner, azamat, view: drawn, id } = await drawnGame();
      expect(drawn.me?.envelope).toBe("ready");
      expect(drawn.openedCount).toBe(0);
      const opened = await act(owner, id, "/open");
      expect(opened.me?.envelope).toBe("opened");
      expect(opened.me?.ward?.id).toBe(drawn.me?.ward?.id);
      expect(opened.openedCount).toBe(1);
      const twice = await act(owner, id, "/open");
      expect(twice.me?.envelope).toBe("opened");
      expect(twice.openedCount).toBe(1);
      expect((await getGame(owner, id)).me?.envelope).toBe("opened");
      // Другие видят только количество.
      const other = await getGame(azamat, id);
      expect(other.openedCount).toBe(1);
      expect(other.me?.envelope).toBe("ready");
    });

    it("Q06: кто открыл письмо — видно всем участникам по человеку, пар — нет", async () => {
      const { owner, azamat, nurai, view: drawn, id } = await drawnGame();
      expect(
        drawn.members.filter((m) => m.joined).map((m) => m.opened),
      ).toEqual([false, false, false]);
      await act(azamat, id, "/open");
      for (const caller of [owner, azamat, nurai]) {
        const view = await getGame(caller, id);
        const opened = view.members.filter((m) => m.opened).map((m) => m.id);
        expect(opened).toEqual([azamat.id]);
        expect(JSON.stringify(view.members)).not.toContain("ward");
      }
    });

    it("«Купил» — счётчик у всех, повтор не удваивает, можно снять", async () => {
      const { owner, azamat, nurai, id } = await drawnGame();
      await act(owner, id, "/open");
      const bought = await act(owner, id, "/bought");
      expect(bought.me?.bought).toBe(true);
      expect(bought.boughtCount).toBe(1);
      const twice = await act(owner, id, "/bought", { bought: true });
      expect(twice.me?.bought).toBe(true);
      expect(twice.boughtCount).toBe(1);
      const other = await getGame(azamat, id);
      expect(other.boughtCount).toBe(1);
      expect(other.me?.bought).toBe(false);

      await act(nurai, id, "/open");
      expect((await act(nurai, id, "/bought", {})).boughtCount).toBe(2);
      await fails(act(owner, id, "/bought", { bought: "да" }), "VALIDATION");

      const undone = await act(owner, id, "/bought", { bought: false });
      expect(undone.me?.bought).toBe(false);
      expect(undone.boughtCount).toBe(1);
      const undoneAgain = await act(owner, id, "/bought", { bought: false });
      expect(undoneAgain.boughtCount).toBe(1);
      expect((await getGame(nurai, id)).me?.bought).toBe(true);
    });

    it("в списке подопечный — только после вскрытия конверта и без вишлиста", async () => {
      const { owner, view: drawn, id } = await drawnGame();
      const before = await listGames(owner);
      expect(before.map((item) => item.game.id)).toEqual([id]);
      expect(before[0]?.me).toEqual({
        envelope: "ready",
        bought: false,
        ward: null,
      });
      await act(owner, id, "/open");
      const after = await listGames(owner);
      expect(after[0]?.me?.envelope).toBe("opened");
      expect(after[0]?.me?.ward?.id).toBe(drawn.me?.ward?.id);
      expect(after[0]?.me?.ward?.name).toBe(drawn.me?.ward?.name);
      expect(after[0]?.me?.ward).not.toHaveProperty("wishlist");
      expect(after[0]?.me?.ward).not.toHaveProperty("overBudgetCount");
    });
  });

  describe("вишлист подопечного", () => {
    const swipe = async (caller: Caller, productId: string) => {
      const response = await api.call<SwipeResponse>(
        caller,
        "POST",
        "/swipes",
        {
          productId,
          decision: "like",
          context: { kind: "self" },
        },
      );
      return response.wishlistItemId ?? "";
    };

    it("X02: бронь друга — «занято» в письме и внизу; «Купил: …» — бронь Санты, у гостя занято", async () => {
      const { owner, azamat, nurai, id } = await drawnGame();
      const everyone = [owner, azamat, nurai];
      // Каждому — три желания из каталога (p_0010, p_0001, p_0002).
      for (const person of everyone) {
        for (const productId of ["p_0010", "p_0001", "p_0002"]) {
          await swipe(person, productId);
        }
      }
      const opened = await act(owner, id, "/open");
      const wardId = opened.me?.ward?.id ?? "";
      const ward = everyone.find((p) => p.id === wardId) as Caller;
      // Друг подопечного бронирует его первое желание.
      const friend = await person("Друг");
      await api.befriend(friend, ward);
      await api.call(friend, "POST", "/reservations", {
        ownerId: wardId,
        itemKey: "p_0010",
      });
      const view = await getGame(owner, id);
      const items = view.me?.ward?.wishlist ?? [];
      expect(items.at(-1)).toMatchObject({ key: "p_0010", reserved: true });
      expect(items.filter((item) => item.reserved)).toHaveLength(1);
      expect(JSON.stringify(view)).not.toContain(friend.id);

      // «Купил: p_0001» — бронь Санты.
      const bought = await act(owner, id, "/bought", {
        bought: true,
        itemKey: "p_0001",
      });
      expect(bought.me?.bought).toBe(true);
      expect(
        bought.me?.ward?.wishlist.find((item) => item.key === "p_0001"),
      ).toMatchObject({ reservedByMe: true });
      const asGuest = await api.call<{
        items: Array<{ itemKey: string; mine: boolean }>;
      }>(friend, "GET", "/reservations", undefined, { ownerId: wardId });
      expect(asGuest.items.map((item) => item.itemKey).sort()).toEqual([
        "p_0001",
        "p_0010",
      ]);
      // Занятое другом не купить.
      await fails(
        act(owner, id, "/bought", { bought: true, itemKey: "p_0010" }),
        "CONFLICT",
      );
    });

    it("Y05: сменил покупку — бронь переехала; снял отметку — брони нет", async () => {
      const { owner, azamat, nurai, id } = await drawnGame();
      const everyone = [owner, azamat, nurai];
      for (const person of everyone) {
        for (const productId of ["p_0010", "p_0001", "p_0002"]) {
          await swipe(person, productId);
        }
      }
      const opened = await act(owner, id, "/open");
      const wardId = opened.me?.ward?.id ?? "";
      const ward = everyone.find((p) => p.id === wardId) as Caller;
      const friend = await person("Друг");
      await api.befriend(friend, ward);
      const taken = async () =>
        (
          await api.call<{ items: Array<{ itemKey: string }> }>(
            friend,
            "GET",
            "/reservations",
            undefined,
            { ownerId: wardId },
          )
        ).items
          .map((item) => item.itemKey)
          .sort();
      const mine = (view: SantaView) =>
        (view.me?.ward?.wishlist ?? [])
          .filter((item) => item.reservedByMe)
          .map((item) => item.key);

      // Купил A → сменил на B: бронь на B, A свободно.
      await act(owner, id, "/bought", { bought: true, itemKey: "p_0001" });
      expect(await taken()).toEqual(["p_0001"]);
      const switched = await act(owner, id, "/bought", {
        bought: true,
        itemKey: "p_0010",
      });
      expect(switched.me?.bought).toBe(true);
      expect(switched.boughtCount).toBe(1);
      expect(mine(switched)).toEqual(["p_0010"]);
      expect(await taken()).toEqual(["p_0010"]);

      // Занятое другом не взять — и прежняя бронь Санты остаётся.
      await api.call(friend, "POST", "/reservations", {
        ownerId: wardId,
        itemKey: "p_0001",
      });
      await fails(
        act(owner, id, "/bought", { bought: true, itemKey: "p_0001" }),
        "CONFLICT",
      );
      expect(await taken()).toEqual(["p_0001", "p_0010"]);

      // «Другое» — бронь Санты снята, отметка осталась.
      const other = await act(owner, id, "/bought", { bought: true });
      expect(other.me?.bought).toBe(true);
      expect(mine(other)).toEqual([]);
      expect(await taken()).toEqual(["p_0001"]);

      // Снова B, потом «Ещё не купил» — ни отметки, ни брони.
      await act(owner, id, "/bought", { bought: true, itemKey: "p_0010" });
      const undone = await act(owner, id, "/bought", { bought: false });
      expect(undone.me?.bought).toBe(false);
      expect(undone.boughtCount).toBe(0);
      expect(mine(undone)).toEqual([]);
      expect(await taken()).toEqual(["p_0001"]);
    });
    const wish = (caller: Caller, body: Record<string, unknown>) =>
      api.call(caller, "POST", "/wishlist/items", body);
    const priceOf = (productId: string) => {
      const product = products.get(productId);
      if (!product) throw new Error(`нет товара ${productId}`);
      return { priceMin: product.priceMin, priceMax: product.priceMax };
    };
    type Expected = {
      overBudget: boolean;
      priceMax: null | number;
      priceMin: null | number;
      productId?: string;
      title?: string;
    };
    const shapeOf = (ward: SantaWard) =>
      ward.wishlist.map((item): Expected => ({
        productId: item.productId ?? undefined,
        title: item.custom?.title,
        priceMin: item.priceMin,
        priceMax: item.priceMax,
        overBudget: item.overBudget,
      }));

    it("активные желания с ценами, «Дороже бюджета» и overBudgetCount", async () => {
      const budget = GAME.budget;
      // Настоящие цены каталога: дешевле бюджета и дороже.
      const cheap = priceOf("p_0001");
      const tiny = priceOf("p_0010");
      const pricey = priceOf("p_0002");
      const range = priceOf("p_0005");
      expect(cheap.priceMin).toBeLessThanOrEqual(budget);
      expect(tiny.priceMin).toBeLessThanOrEqual(budget);
      expect(pricey.priceMin).toBeGreaterThan(budget);
      expect(range.priceMin).toBeGreaterThan(budget);
      expect(range.priceMax).toBeGreaterThan(range.priceMin);

      const { owner, azamat, nurai } = await trio();
      const created = await createGame(owner, {
        participantIds: [azamat.id, nurai.id],
      });
      const id = created.game.id;
      await act(azamat, id, "/join");
      await act(nurai, id, "/join");
      expect(
        (await getGame(owner, id)).members.map((m) => m.hasWishlist),
      ).toEqual([false, false, false]);

      // Айгерим: товар дешевле бюджета, своё «от–до» и своё «от» дороже.
      await swipe(owner, "p_0001");
      await wish(owner, { title: "Книга", priceMin: 500, priceMax: 2500 });
      await wish(owner, { title: "Шарф", priceMin: 2500 });
      // Азамат: товар дороже, дешёвый товар, своё «до» дороже, ровно бюджет.
      await swipe(azamat, "p_0002");
      await swipe(azamat, "p_0010");
      await wish(azamat, { title: "Свитер", priceMax: 3000 });
      await wish(azamat, { title: "Плед", priceMin: budget, priceMax: budget });
      // Нурай: подаренное не видно, товар с разбросом цены, своё без цены.
      const given = await swipe(nurai, "p_0010");
      await api.call(nurai, "POST", `/wishlist/items/${given}/given`, {
        at: GIVEN_AT,
      });
      await swipe(nurai, "p_0005");
      await wish(nurai, { title: "Сюрприз" });

      const expected: Record<string, Expected[]> = {
        [owner.id]: [
          { productId: "p_0001", ...cheap, overBudget: false },
          { title: "Книга", priceMin: 500, priceMax: 2500, overBudget: false },
          { title: "Шарф", priceMin: 2500, priceMax: 2500, overBudget: true },
        ],
        [azamat.id]: [
          { productId: "p_0002", ...pricey, overBudget: true },
          { productId: "p_0010", ...tiny, overBudget: false },
          { title: "Свитер", priceMin: 3000, priceMax: 3000, overBudget: true },
          {
            title: "Плед",
            priceMin: budget,
            priceMax: budget,
            overBudget: false,
          },
        ],
        [nurai.id]: [
          { productId: "p_0005", ...range, overBudget: true },
          {
            title: "Сюрприз",
            priceMin: null,
            priceMax: null,
            overBudget: false,
          },
        ],
      };
      const names: Record<string, string> = {
        [owner.id]: "Айгерим",
        [azamat.id]: "Азамат",
        [nurai.id]: "Нурай",
      };

      const drawn = await act(owner, id, "/draw");
      expect(drawn.members.map((m) => m.hasWishlist)).toEqual([
        true,
        true,
        true,
      ]);
      // В бюджете — по нижней цене, без цены — не в бюджете (Z03).
      expect(drawn.members.map((m) => m.wishesInBudget)).toEqual([2, 2, 0]);
      const everyone = [owner, azamat, nurai];
      const wards = await wardsOf(id, everyone);
      expectPairs(
        wards,
        everyone.map((caller) => caller.id),
      );
      for (const caller of everyone) {
        const ward = (await act(caller, id, "/open")).me?.ward;
        if (!ward) throw new Error("нет подопечного");
        const wardId = wards[caller.id] ?? "";
        expect(ward.id).toBe(wardId);
        expect(ward.name).toBe(names[wardId]);
        // Ожидания записаны в порядке добавления, а новые желания — первыми.
        expect(shapeOf(ward)).toEqual([...(expected[wardId] ?? [])].reverse());
        expect(ward.overBudgetCount).toBe(
          expected[wardId]?.filter((item) => item.overBudget).length,
        );
        // Ключ желания — как в гостевом вишлисте: есть у каждого.
        expect(ward.wishlist.every((item) => item.key !== "")).toBe(true);
      }
    });
  });

  describe("приватность пар (§4.6, п. 2)", () => {
    it(`в игре на ${MAX_MEMBERS} человек каждый во всех ответах видит только своего подопечного`, async () => {
      const owner = await person("Айгерим");
      const invited = await friendOf(owner, "Бекзат");
      const created = await createGame(owner, {
        participantIds: [invited.id],
      });
      const id = created.game.id;
      const people = await crowd(MAX_MEMBERS - 1);
      for (const caller of people) await act(caller, id, "/join");
      const everyone = [owner, ...people];

      const drawn = await act(owner, id, "/draw");
      expect(drawn.game.participantIds).toHaveLength(MAX_MEMBERS);
      const wards = await wardsOf(id, everyone);
      expectPairs(
        wards,
        everyone.map((caller) => caller.id),
      );
      expectOnlyOwnWard(drawn, owner, wards);

      // Каждый, включая организатора, — по всем маршрутам Санты.
      for (const caller of everyone) {
        const responses: AnyView[] = [
          await getGame(caller, id),
          ...(await listGames(caller)),
          await act(caller, id, "/join"),
          await act(caller, id, "/open"),
          await act(caller, id, "/bought"),
          await act(caller, id, "/bought", { bought: false }),
          ...(await listGames(caller)),
        ];
        for (const view of responses) expectOnlyOwnWard(view, caller, wards);
        // Подопечный — свой и в карточке, и в списке после вскрытия.
        const list = await listGames(caller);
        expect(list[0]?.me?.ward?.id).toBe(wards[caller.id]);
        // Правка и жеребьёвка после жеребьёвки — ошибка без данных игры.
        const patched = await patchGame(caller, id, { budget: 1000 }).catch(
          (error: unknown) => error,
        );
        expect(JSON.stringify(patched)).not.toContain("ward");
        const redraw = await act(caller, id, "/draw").catch(
          (error: unknown) => error,
        );
        expect(JSON.stringify(redraw)).not.toContain("ward");
      }

      // Выбывший позванный и чужой — без пары вовсе.
      const stranger = await person("Бакыт");
      for (const outsider of [invited, stranger]) {
        const view = await getGame(outsider, id);
        expect(view.role).toBe("guest");
        expect(view.me).toBeNull();
        const json = JSON.stringify(view);
        expect(json).not.toContain("assignments");
        expect(json).not.toContain('"ward"');
        expect(json).not.toContain("overBudgetCount");
        expect(await listGames(outsider)).toEqual([]);
      }

      // Счётчики — у всех одинаковые.
      const final = await getGame(owner, id);
      expect(final.openedCount).toBe(MAX_MEMBERS);
      expect(final.boughtCount).toBe(0);

      // В событиях — ни пар, ни подопечных.
      const events = JSON.stringify(api.events());
      expect(events).not.toContain("assignments");
      expect(events).not.toContain("ward");
    }, 120_000);
  });

  // S05: исключения и причины с именами — только организатору. Игра на 6
  // с двумя исключениями: Азамат не дарит организатору и Нурай. Пока в
  // игре все шестеро, пары сходятся; Данияр и Тимур вышли — Азамату некому
  // дарить, и жеребьёвка по дате не прошла.
  describe("исключения и причины — только организатору (S05)", () => {
    // Проход планировщика: у мока — POST /santa/tick (его зовёт вкладка), у
    // сервера — планировщик (B13).
    const runTick = async () => {
      if (api.kind === "mock") {
        await api.call(null, "POST", "/santa/tick");
      } else {
        await api.expire();
      }
    };

    it("участник, позванный, чужой и гость без профиля — без исключений, drawIssue и причины", async () => {
      const { owner, azamat, nurai } = await trio();
      const daniyar = await friendOf(owner, "Данияр");
      const timur = await friendOf(owner, "Тимур");
      const bekzat = await friendOf(owner, "Бекзат");
      const pairs: Array<[string, string]> = [
        [azamat.id, owner.id],
        [azamat.id, nurai.id],
      ];
      const created = await createGame(owner, {
        participantIds: [azamat.id, nurai.id, daniyar.id, timur.id, bekzat.id],
        exclusions: pairs,
        drawMode: "date",
        drawAt: new Date(NOW + HOUR).toISOString(),
      });
      const id = created.game.id;
      expect(created.game.exclusions).toHaveLength(2);
      for (const caller of [azamat, nurai, daniyar, timur]) {
        await act(caller, id, "/join");
      }
      expect((await getGame(owner, id)).drawIssue).toBeNull();
      await act(daniyar, id, "/leave");
      await act(timur, id, "/leave");
      api.advance(2 * HOUR);
      await runTick();

      // Организатору — всё на месте.
      const forOwner = await getGame(owner, id);
      expect(
        sorted(forOwner.game.exclusions.map((pair) => pair.join("+"))),
      ).toEqual(sorted(pairs.map((pair) => pair.join("+"))));
      const reason = forOwner.drawIssue ?? "";
      expect(reason).toMatch(/^Слишком много исключений: .+ некому дарить$/);
      expect(forOwner.drawFailed).toEqual({
        at: new Date(NOW + 2 * HOUR).toISOString(),
        reason,
      });
      const [ownerSummary] = await listGames(owner);
      expect(ownerSummary?.drawFailed?.reason).toBe(reason);
      expect(ownerSummary?.game.exclusions).toHaveLength(2);
      expect(
        forOwner.members.every((m) => "hasWishlist" in m && "opened" in m),
      ).toBe(true);

      // Кому некому дарить — в дательном («Азамату»): в чужих ответах этого
      // слова быть не должно, а id обеих сторон рядом — признак пары.
      const stuck = /: (.+) некому дарить$/.exec(reason)?.[1] ?? "";
      expect(stuck).not.toBe("");
      const pairTexts = pairs.flatMap(([a, b]) => [
        JSON.stringify([a, b]),
        JSON.stringify([b, a]),
      ]);
      const expectHidden = (view: AnyView) => {
        expect(view.role).not.toBe("owner");
        expect(view.game.exclusions).toEqual([]);
        expect(view.drawIssue).toBeNull();
        if (view.drawFailed) {
          expect(view.drawFailed).toEqual({ at: forOwner.drawFailed?.at });
        }
        const json = JSON.stringify(view);
        for (const text of pairTexts) expect(json).not.toContain(text);
        expect(json).not.toContain(reason);
        expect(json).not.toContain("некому дарить");
        // Имя застрявшего само по себе есть в участниках — ищем фразу причины.
        expect(json).not.toContain(`${stuck} некому`);
      };

      // Участники (и сам Азамат) и позванный — во всех ответах.
      for (const caller of [nurai, azamat, bekzat]) {
        const views: AnyView[] = [
          await getGame(caller, id),
          ...(await listGames(caller)),
        ];
        expect(views).toHaveLength(2);
        for (const view of views) {
          expectHidden(view);
          expect(view.drawFailed).toEqual({ at: forOwner.drawFailed?.at });
        }
      }
      expectHidden(await act(nurai, id, "/join"));

      // Чужой с профилем и гость по ссылке без профиля (X07): у людей —
      // только профиль и joined.
      const stranger = await person("Бермет");
      for (const caller of [stranger, null]) {
        const view = await api.call<SantaView>(caller, "GET", gamePath(id));
        expect(view.role).toBe("guest");
        expectHidden(view);
        for (const member of view.members) {
          expect(member).not.toHaveProperty("hasWishlist");
          expect(member).not.toHaveProperty("opened");
          expect(member).toHaveProperty("joined");
        }
      }
    });
  });
});
