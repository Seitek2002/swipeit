import type { Product } from "@swipeit/core/api/catalog/types";
import type { SantaView } from "@swipeit/core/api/santa/types";
import type { WishlistResponse } from "@swipeit/core/api/wishlist/types";

import {
  type Client,
  createClient,
  openSocket,
  type Person,
  type Socket,
} from "./client";
import { findPairLeaks } from "./privacy";

// Репетиция офиса (auto-tasks-pm-4 S06): N человек проходят Тайного Санту
// против живого сервера — только HTTP и WebSocket. Шаги и проверки — по
// задаче; итог — таблица проверок, время ответов и ответы не 2xx.

export type RehearsalOptions = {
  base: string;
  // «Проверка проверки»: подменить чужой GET /santa/:id так, чтобы в нём
  // оказался ward, — шаг 7 обязан упасть.
  injectLeak: boolean;
  keep: boolean;
  log: (line: string) => void;
  opsToken?: string;
  people: number;
  // Темп создания профилей: лимит R01 — 20 в минуту с IP.
  usersPerMinute: number;
};

type Check = { detail?: string; ok: boolean; step: string; title: string };

export type RehearsalResult = {
  checks: Check[];
  ok: boolean;
  summary: string;
  warnings: string[];
};

const BUDGET = 2000;
const NEW_BUDGET = 2500;
const TITLE = "Офис: репетиция";
const MAX_BUYERS = 5;
const TOAST_WAIT_MS = 4_000;

// Имена офиса; двое «Азамат» — тёзки (R04).
const NAMES = [
  "Айгерим",
  "Азамат",
  "Нурлан",
  "Азамат",
  "Бакыт",
  "Жылдыз",
  "Данияр",
  "Асель",
  "Эрлан",
  "Гульнара",
  "Тимур",
  "Айпери",
  "Улан",
  "Чолпон",
  "Бекзат",
  "Мээрим",
  "Эмиль",
  "Айжан",
  "Канат",
  "Динара",
  "Руслан",
  "Алтынай",
  "Нурбек",
  "Сезим",
  "Адилет",
  "Камила",
  "Самат",
  "Бермет",
  "Ислам",
  "Назира",
];

class Abort extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// День по календарю Бишкека — как у сервера (BACKEND.md §2.5).
const bishkekDay = (ms: number) =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bishkek",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(ms));

const DAY_MS = 24 * 3600_000;

// По 5 запросов одновременно: офис нажимает «Вступить» почти разом.
const inBatches = async <T>(
  items: readonly T[],
  size: number,
  task: (item: T, index: number) => Promise<void>,
) => {
  for (let start = 0; start < items.length; start += size) {
    await Promise.all(
      items
        .slice(start, start + size)
        .map((item, offset) => task(item, start + offset)),
    );
  }
};

const waitFor = async (condition: () => boolean, ms: number) => {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (condition()) return true;
    await sleep(100);
  }
  return condition();
};

const pad = (value: string, width: number) =>
  value.length >= width ? value : value + " ".repeat(width - value.length);

export const runRehearsal = async (
  options: RehearsalOptions,
): Promise<RehearsalResult> => {
  const { base, log } = options;
  const api: Client = createClient(base);
  const checks: Check[] = [];
  const warnings: string[] = [];
  const people: Person[] = [];
  const sockets = new Map<string, Socket>();
  let step = "0. сервер";

  const check = (title: string, ok: boolean, detail?: string) => {
    checks.push({ step, title, ok, ...(detail ? { detail } : {}) });
    log(`  ${ok ? "ok  " : "FAIL"} ${title}${detail ? ` — ${detail}` : ""}`);
    return ok;
  };
  // Без этого дальше идти некуда.
  const must = (title: string, ok: boolean, detail?: string) => {
    if (!check(title, ok, detail)) throw new Abort(title);
  };
  const begin = (name: string) => {
    step = name;
    log(`\n${name}`);
  };

  const n = options.people;
  let tomorrow = "";

  try {
    // ── 0. Сервер жив ──────────────────────────────────────────────
    begin("0. Сервер");
    const health = await api.raw("/v1/health");
    let serverNow = Date.now();
    try {
      const parsed = JSON.parse(health.text) as { app?: string; now?: number };
      if (typeof parsed.now === "number") serverNow = parsed.now;
      must(
        "GET /v1/health — это SwipeIt",
        health.status === 200 && parsed.app === "swipeit",
        `статус ${health.status}`,
      );
    } catch (error) {
      if (error instanceof Abort) throw error;
      must("GET /v1/health — это SwipeIt", false, health.text.slice(0, 120));
    }
    tomorrow = bishkekDay(serverNow + DAY_MS);
    const exchangeDate = bishkekDay(serverNow + 10 * DAY_MS);

    // ── 1. Профили ─────────────────────────────────────────────────
    begin(
      `1. Профили: ${n} человек, не больше ${options.usersPerMinute} в минуту`,
    );
    const interval = Math.ceil(60_000 / options.usersPerMinute) + 50;
    let rateLimited = 0;
    for (let index = 0; index < n; index += 1) {
      const started = Date.now();
      const created = await api.call<{ me: { id: string }; token: string }>(
        null,
        "POST",
        "/users",
        { body: {} },
      );
      if (created.status === 429) rateLimited += 1;
      if (created.ok) {
        const name = NAMES[index] ?? `Коллега ${index + 1}`;
        const person = {
          id: created.body.me.id,
          token: created.body.token,
          name,
        };
        people.push(person);
        await api.call(person, "PATCH", "/me", { body: { name } });
      }
      if (index < n - 1) {
        await sleep(Math.max(0, interval - (Date.now() - started)));
      }
    }
    check(
      "лимит R01: ни одного 429 на POST /users",
      rateLimited === 0,
      `429: ${rateLimited}`,
    );
    must(
      `создано ${n} профилей`,
      people.length === n,
      `${people.length} из ${n}`,
    );
    const named = await Promise.all(
      people.map((person) => api.call<{ name?: string }>(person, "GET", "/me")),
    );
    check(
      "у всех имя, двое «Азамат»",
      named.every((reply, index) => reply.body.name === people[index]?.name) &&
        people.filter((person) => person.name === "Азамат").length === 2,
    );

    // Сокеты всех — с самого начала: события копятся для проверки
    // приватности (шаг 7) и тостов (шаг 5).
    await inBatches(people, 5, async (person) => {
      try {
        sockets.set(person.id, await openSocket(base, person));
      } catch (error) {
        warnings.push(`сокет ${person.name}: ${String(error)}`);
      }
    });
    check(
      "сокеты открыты у всех",
      sockets.size === n,
      `${sockets.size} из ${n}`,
    );

    const owner = people[0] as Person;
    const others = people.slice(1);
    const byId = new Map(people.map((person) => [person.id, person]));

    // ── 2. Игра ────────────────────────────────────────────────────
    begin("2. Игра: создать, ссылка, вступления по коду");
    const created = await api.call<SantaView>(owner, "POST", "/santa", {
      body: {
        title: TITLE,
        budget: BUDGET,
        exchangeDate,
        drawMode: "manual",
        participantIds: [],
      },
    });
    must("POST /santa — игра создана", created.ok, `статус ${created.status}`);
    const gameId = created.body.game.id;
    const params = { id: gameId };
    check(
      `бюджет ${BUDGET}, обмен ${exchangeDate}, ручная жеребьёвка`,
      created.body.game.budget === BUDGET &&
        created.body.game.exchangeDate === exchangeDate &&
        !created.body.game.drawAt,
    );
    const link = await api.call<{ code: string; url: string }>(
      owner,
      "POST",
      "/share-links",
      { body: { kind: "santa", targetId: gameId } },
    );
    must("POST /share-links — код ссылки", link.ok && Boolean(link.body.code));
    const code = link.body.code;
    let resolved = 0;
    let joined = 0;
    await inBatches(others, 5, async (person) => {
      const share = await api.call<{ gameId?: string; kind?: string }>(
        person,
        "GET",
        "/share/:code",
        { params: { code } },
      );
      if (share.body.kind === "santa" && share.body.gameId === gameId) {
        resolved += 1;
      }
      const join = await api.call<SantaView>(
        person,
        "POST",
        "/santa/:id/join",
        {
          params: { id: share.body.gameId ?? gameId },
        },
      );
      if (join.ok && join.body.role === "participant") joined += 1;
    });
    check(
      "GET /share/:code ведёт в игру",
      resolved === others.length,
      `${resolved} из ${others.length}`,
    );
    const afterJoin = await api.call<SantaView>(owner, "GET", "/santa/:id", {
      params,
    });
    must(
      `вступили ${others.length}, в игре ${n}`,
      joined === others.length &&
        afterJoin.body.game.participantIds.length === n,
      `вступили ${joined}, в игре ${afterJoin.body.game.participantIds.length}`,
    );

    // ── 3. Вишлисты ────────────────────────────────────────────────
    const withoutCount = Math.max(1, Math.round((n * 4) / 25));
    const withWishes = people.slice(0, n - withoutCount);
    begin(
      `3. Вишлисты: ${withWishes.length} — по 3 желания в бюджете, ${withoutCount} — ничего`,
    );
    const filters = JSON.stringify({
      budget: { min: 0, max: BUDGET },
      categories: [],
      marketplaces: [],
    });
    let filled = 0;
    await inBatches(withWishes, 5, async (person) => {
      const feed = await api.call<{ items: Product[] }>(
        person,
        "GET",
        "/catalog/feed",
        {
          query: { limit: "30", filters },
        },
      );
      const fit = (feed.body.items ?? []).filter(
        (product) => product.priceMin <= BUDGET,
      );
      // Как в колоде: одно «Мимо», потом три «Хочу».
      const [skip, ...rest] = fit;
      if (skip) {
        await api.call(person, "POST", "/swipes", {
          body: {
            productId: skip.id,
            decision: "pass",
            context: { kind: "self" },
          },
        });
      }
      for (const product of rest.slice(0, 3)) {
        await api.call(person, "POST", "/swipes", {
          body: {
            productId: product.id,
            decision: "like",
            context: { kind: "self" },
          },
        });
      }
      const wishlist = await api.call<WishlistResponse>(
        person,
        "GET",
        "/wishlist",
      );
      if (wishlist.body.wishCount >= 3) filled += 1;
    });
    check(
      "3+ желания в бюджете",
      filled === withWishes.length,
      `${filled} из ${withWishes.length}`,
    );
    const gathering = await api.call<SantaView>(owner, "GET", "/santa/:id", {
      params,
    });
    const hasWishlist = gathering.body.members.filter(
      (member) => member.hasWishlist,
    ).length;
    check(
      "у организатора «вишлист готов» — ровно у них",
      hasWishlist === withWishes.length,
      `${hasWishlist}`,
    );

    // ── 4. Исключения ──────────────────────────────────────────────
    begin("4. Исключения: две пары, невозможное — CONFLICT");
    const id = (index: number) => (people[index] as Person).id;
    const pairs: Array<[string, string]> = [
      [id(1), id(2)],
      [id(3), id(4)],
    ];
    const patched = await api.call<SantaView>(owner, "PATCH", "/santa/:id", {
      params,
      body: { exclusions: pairs },
    });
    check(
      "PATCH — две пары",
      patched.ok && patched.body.game.exclusions.length === 2,
      `статус ${patched.status}`,
    );
    const lonely = id(n - 1);
    const impossible = await api.call(owner, "PATCH", "/santa/:id", {
      params,
      body: {
        exclusions: [
          ...pairs,
          ...people
            .filter((person) => person.id !== lonely)
            .map((person): [string, string] => [lonely, person.id]),
        ],
      },
      expect: [409],
    });
    check(
      "невозможное исключение — 409 CONFLICT",
      impossible.status === 409 && impossible.code === "CONFLICT",
      `статус ${impossible.status} ${impossible.code ?? ""}`,
    );
    const unchanged = await api.call<SantaView>(owner, "GET", "/santa/:id", {
      params,
    });
    check(
      "игра не изменилась: исключений по-прежнему 2",
      unchanged.body.game.exclusions.length === 2,
    );

    // ── 5. Правка условий ──────────────────────────────────────────
    begin(
      `5. Правка условий: бюджет ${BUDGET} → ${NEW_BUDGET}, тост участникам`,
    );
    const toastsBefore = new Map(
      people.map((person) => [
        person.id,
        sockets.get(person.id)?.messages.length ?? 0,
      ]),
    );
    const termsToast = (person: Person) =>
      (sockets.get(person.id)?.messages ?? [])
        .slice(toastsBefore.get(person.id) ?? 0)
        .some(
          (event) =>
            (event as { text?: unknown; type?: unknown }).type === "toast" &&
            String((event as { text?: unknown }).text).includes(
              "изменил условия",
            ),
        );
    const budgetPatch = await api.call<SantaView>(
      owner,
      "PATCH",
      "/santa/:id",
      {
        params,
        body: { budget: NEW_BUDGET },
      },
    );
    check(
      "PATCH бюджета",
      budgetPatch.ok && budgetPatch.body.game.budget === NEW_BUDGET,
    );
    const listening = others.filter((person) => sockets.has(person.id));
    await waitFor(() => listening.every(termsToast), TOAST_WAIT_MS);
    const got = listening.filter(termsToast).length;
    check(
      "тост «Организатор изменил условия» пришёл участникам (нужно хотя бы 3)",
      got === listening.length && got >= 3,
      `${got} из ${listening.length}`,
    );
    check("у организатора тоста нет", !termsToast(owner));

    // ── 6. Жеребьёвка ──────────────────────────────────────────────
    begin("6. Жеребьёвка: два одновременных draw");
    const draws = await Promise.all([
      api.call<SantaView>(owner, "POST", "/santa/:id/draw", {
        params,
        expect: [409],
      }),
      api.call<SantaView>(owner, "POST", "/santa/:id/draw", {
        params,
        expect: [409],
      }),
    ]);
    const statuses = draws.map((reply) => reply.status).sort();
    must(
      "одна жеребьёвка: 200 и 409",
      statuses[0] === 200 && statuses[1] === 409,
      statuses.join(", "),
    );

    // ── 7. Письма и приватность ───────────────────────────────────
    begin("7. Письма: у каждого свой подопечный; чужих пар не видно");
    const wardOf = new Map<string, string>();
    await inBatches(people, 5, async (person) => {
      const opened = await api.call<SantaView>(
        person,
        "POST",
        "/santa/:id/open",
        { params },
      );
      const ward = opened.body.me?.ward;
      if (opened.ok && opened.body.me?.envelope === "opened" && ward) {
        wardOf.set(person.id, ward.id);
      }
    });
    must("конверт вскрыли все", wardOf.size === n, `${wardOf.size} из ${n}`);
    const wards = [...wardOf.values()];
    check("подопечные у всех разные", new Set(wards).size === n);
    check(
      "никто не дарит себе",
      [...wardOf].every(([santa, ward]) => santa !== ward),
    );
    check(
      "ни одна пара исключений не сработала",
      pairs.every(([a, b]) => wardOf.get(a) !== b && wardOf.get(b) !== a),
    );
    const santaOf = new Map([...wardOf].map(([santa, ward]) => [ward, santa]));

    // Каждый ещё раз смотрит игру и список — это тоже уходит в проверку.
    const victim = people[2] as Person;
    const foreign = people.find(
      (person) =>
        person.id !== victim.id &&
        wardOf.get(person.id) !== wardOf.get(victim.id),
    );
    await inBatches(people, 5, async (person) => {
      await api.call(person, "GET", "/santa/:id", {
        params,
        ...(options.injectLeak && person.id === victim.id && foreign
          ? {
              // Проверка проверки: в «мой» ответ подложен чужой подопечный.
              tamper: (body: unknown) => {
                const view = body as SantaView;
                const ward = wardOf.get(foreign.id) ?? "";
                if (view.me) {
                  view.me.ward = {
                    id: ward,
                    name: byId.get(ward)?.name ?? "",
                    avatarColor: "mandarin",
                    isBot: false,
                    overBudgetCount: 0,
                    wishlist: [],
                  } as unknown as NonNullable<SantaView["me"]>["ward"];
                }
                return view;
              },
            }
          : {}),
      });
      await api.call(person, "GET", "/santa");
    });
    const ownWards = (person: Person) =>
      new Set([wardOf.get(person.id) ?? ""].filter(Boolean));
    const privacy = (
      label: string,
      wardsOf: (person: Person) => Set<string>,
    ) => {
      const leaks = people.flatMap((person) =>
        findPairLeaks({
          viewerId: person.id,
          ownWardIds: wardsOf(person),
          responses: api.receivedBy(person.id),
          events: sockets.get(person.id)?.messages ?? [],
        }).map((leak) => `${person.name}: ${leak.reason} (${leak.path})`),
      );
      check(label, leaks.length === 0, leaks.slice(0, 3).join("; "));
    };
    privacy("в ответах и событиях нет чужих пар", ownWards);
    const guest = await api.call<SantaView>(null, "GET", "/santa/:id", {
      params,
    });
    check(
      "гость по ссылке без профиля — без «моего» и без пар",
      guest.ok &&
        guest.body.me === null &&
        findPairLeaks({
          viewerId: "",
          ownWardIds: new Set(),
          responses: [{ route: "/santa/:id", body: guest.body }],
          events: [],
        }).length === 0,
    );
    // Исключения — только организатору (S05).
    const exclusionsSeen = people
      .slice(1)
      .some((person) =>
        api
          .receivedBy(person.id)
          .some(
            ({ body }) =>
              ((body as Partial<SantaView>)?.game?.exclusions?.length ?? 0) > 0,
          ),
      );
    const guestSees = (guest.body.game?.exclusions?.length ?? 0) > 0;
    check(
      "исключения видит только организатор — не участники и не гость",
      !exclusionsSeen && !guestSees,
    );

    // ── 8. Покупки ─────────────────────────────────────────────────
    // Кого уберём на шаге 9: не организатор, его Санта — не его подопечный
    // (иначе пары чинятся иначе). Ни он, ни его Санта не покупают — тогда в
    // отчёте ровно «купили 5».
    const removed = others.find((person) => {
      const santa = santaOf.get(person.id);
      return santa && santa !== wardOf.get(person.id);
    });
    must("есть кого убрать на шаге 9", Boolean(removed));
    const gone = removed as Person;
    const goneSanta = byId.get(santaOf.get(gone.id) ?? "") as Person;
    begin("8. Покупки: «Купил» желанием из вишлиста подопечного");
    const views = new Map<string, SantaView>();
    for (const person of people) {
      const view = await api.call<SantaView>(person, "GET", "/santa/:id", {
        params,
      });
      views.set(person.id, view.body);
    }
    const candidates = people
      .filter((person) => person.id !== gone.id && person.id !== goneSanta.id)
      .map((person) => ({
        person,
        item: views
          .get(person.id)
          ?.me?.ward?.wishlist.find(
            (wish) => !wish.reserved && !wish.overBudget,
          ),
      }))
      .filter(
        (
          buyer,
        ): buyer is { item: NonNullable<typeof buyer.item>; person: Person } =>
          Boolean(buyer.item),
      );
    // В маленькой группе (--people 5) подходящих меньше пяти — берём сколько
    // есть, но хотя бы одного.
    const buyers = candidates.slice(0, MAX_BUYERS);
    check(
      `покупателей ${Math.min(MAX_BUYERS, candidates.length)} (не меньше одного)`,
      buyers.length >= 1,
      `${buyers.length}`,
    );
    let countedOk = 0;
    let anonymous = 0;
    for (const { person, item } of buyers) {
      const ward = byId.get(wardOf.get(person.id) ?? "") as Person;
      const before = await api.call<WishlistResponse>(ward, "GET", "/wishlist");
      const bought = await api.call<SantaView>(
        person,
        "POST",
        "/santa/:id/bought",
        {
          params,
          body: { bought: true, itemKey: item.key },
        },
      );
      const after = await api.call<WishlistResponse>(ward, "GET", "/wishlist");
      if (
        bought.ok &&
        bought.body.me?.bought &&
        (after.body.reservationCount ?? -1) ===
          (before.body.reservationCount ?? 0) + 1
      ) {
        countedOk += 1;
      }
      const text = JSON.stringify(after.body);
      const uniqueName =
        people.filter((other) => other.name === person.name).length === 1 &&
        person.name !== ward.name;
      if (
        !text.includes(person.id) &&
        !(uniqueName && text.includes(person.name))
      ) {
        anonymous += 1;
      }
    }
    check(
      "у подопечного счётчик броней +1",
      countedOk === buyers.length,
      `${countedOk} из ${buyers.length}`,
    );
    check(
      "в вишлисте подопечного нет ни id, ни имени Санты",
      anonymous === buyers.length,
    );
    const boughtCount = (
      await api.call<SantaView>(owner, "GET", "/santa/:id", { params })
    ).body.boughtCount;
    check(
      `купили ${buyers.length} — видно счётчиком`,
      boughtCount === buyers.length,
      `${boughtCount}`,
    );

    // ── 9. Убрать после жеребьёвки ────────────────────────────────
    begin(`9. «Убрать» после жеребьёвки: организатор убирает ${gone.name}`);
    const toastMark = sockets.get(goneSanta.id)?.messages.length ?? 0;
    const removal = await api.call<SantaView>(
      owner,
      "DELETE",
      "/santa/:id/members/:userId",
      {
        params: { id: gameId, userId: gone.id },
      },
    );
    must(
      "DELETE /santa/:id/members/:userId",
      removal.ok,
      `статус ${removal.status}`,
    );
    const newWard = wardOf.get(gone.id) ?? "";
    let samePairs = 0;
    let rewiredOk = false;
    const remaining = people.filter((person) => person.id !== gone.id);
    for (const person of remaining) {
      const view = await api.call<SantaView>(person, "GET", "/santa/:id", {
        params,
      });
      const me = view.body.me;
      if (person.id === goneSanta.id) {
        rewiredOk = me?.envelope === "ready" && me.ward?.id === newWard;
      } else if (
        me?.envelope === "opened" &&
        me.ward?.id === wardOf.get(person.id)
      ) {
        samePairs += 1;
      }
    }
    check(
      "у его Санты новое письмо (запечатано, подопечный — бывший подопечный убранного)",
      rewiredOk,
    );
    check(
      "у остальных пары прежние",
      samePairs === remaining.length - 1,
      `${samePairs} из ${remaining.length - 1}`,
    );
    const goneView = await api.call<SantaView>(gone, "GET", "/santa/:id", {
      params,
    });
    check("убранный в игре больше не участник", goneView.body.me === null);
    const santaSocket = sockets.get(goneSanta.id);
    await waitFor(
      () => (santaSocket?.messages.length ?? 0) > toastMark,
      TOAST_WAIT_MS,
    );
    check(
      "Санте убранного — тост «открой новое письмо»",
      (santaSocket?.messages ?? [])
        .slice(toastMark)
        .some((event) =>
          String((event as { text?: unknown }).text ?? "").includes(
            "новое письмо",
          ),
        ),
    );
    privacy("после «Убрать» чужих пар по-прежнему не видно", (person) =>
      person.id === goneSanta.id
        ? new Set([wardOf.get(person.id) ?? "", newWard])
        : ownWards(person),
    );

    // ── 10. Отчёт владельцу ────────────────────────────────────────
    begin("10. Отчёт GET /v1/ops/report");
    if (options.opsToken) {
      const report = await api.raw("/v1/ops/report?days=1", options.opsToken);
      const members = n - 1;
      const line = `открыли письмо ${members - 1} из ${members}, купили ${buyers.length} из ${members}`;
      check("отчёт отвечает", report.status === 200, `статус ${report.status}`);
      check(`в отчёте «${line}»`, report.text.includes(line));
      check(
        "в отчёте нет id игры, людей и названия",
        ![gameId, TITLE, ...people.map((person) => person.id)].some((secret) =>
          report.text.includes(secret),
        ),
      );
    } else {
      log("  пропущен: нет --ops-token");
    }
  } catch (error) {
    if (!(error instanceof Abort)) {
      checks.push({
        step,
        title: "сценарий упал",
        ok: false,
        detail: String(error),
      });
      log(`  FAIL сценарий упал — ${String(error)}`);
    } else {
      log("  дальше идти некуда — к уборке");
    }
  } finally {
    // ── 12. Уборка ────────────────────────────────────────────────
    for (const socket of sockets.values()) socket.close();
    if (options.keep) {
      log(
        `\n12. Уборка пропущена (--keep): ${people.length} профилей остались`,
      );
    } else if (people.length > 0) {
      begin(`12. Уборка: DELETE /me у ${people.length}`);
      let deleted = 0;
      for (const person of [...people].reverse()) {
        const reply = await api.call(person, "DELETE", "/me");
        if (reply.ok) deleted += 1;
      }
      check(
        "профили удалены",
        deleted === people.length,
        `${deleted} из ${people.length}`,
      );
    }
  }

  // ── 11. Итог ─────────────────────────────────────────────────────
  const unexpected = api.unexpected;
  checks.push({
    step: "11. Итог",
    title: "ответов не 2xx, кроме ожидаемых, — нет",
    ok: unexpected.length === 0,
    ...(unexpected.length > 0 ? { detail: `${unexpected.length}` } : {}),
  });
  const failed = checks.filter((item) => !item.ok);
  const lines = [
    "",
    "Время ответа, мс:",
    `  ${pad("маршрут", 44)} ${pad("n", 4)} ${pad("p50", 6)} p95`,
  ];
  for (const row of api.latency()) {
    lines.push(
      `  ${pad(row.route, 44)} ${pad(String(row.count), 4)} ${pad(row.p50.toFixed(0), 6)} ${row.p95.toFixed(0)}`,
    );
  }
  lines.push("", `Ответы не 2xx, которых не ждали: ${unexpected.length}`);
  for (const item of unexpected.slice(0, 20)) {
    lines.push(
      `  ${item.route} → ${item.status} ${item.code ?? ""} ${item.message ?? ""}${item.requestId ? ` (код ${item.requestId.slice(0, 8)})` : ""}`,
    );
  }
  if (warnings.length > 0) {
    lines.push("", "Предупреждения:", ...warnings.map((text) => `  ${text}`));
  }
  lines.push(
    "",
    failed.length === 0
      ? `ИТОГ: ПРОШЛА — проверок ${checks.length}, все зелёные.`
      : `ИТОГ: НЕ ПРОШЛА — упало ${failed.length} из ${checks.length}:`,
    ...failed.map(
      (item) =>
        `  [${item.step}] ${item.title}${item.detail ? ` — ${item.detail}` : ""}`,
    ),
  );
  if (tomorrow) {
    lines.push(
      "",
      `Счётчики воронки репетиции остаются: живой отчёт смотреть с --since ${tomorrow} (или ?since=${tomorrow}).`,
    );
  }
  return {
    checks,
    warnings,
    ok: failed.length === 0,
    summary: lines.join("\n"),
  };
};
