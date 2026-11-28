import { toDateKey } from "@swipeit/core/format";
import { eq, gte, sql } from "drizzle-orm";
import { z } from "zod";

import type { Database } from "../../db/client";
import { funnelDaily, shareLinks } from "../../db/schema";
import { readErrorsDaily } from "../../errors";
import { dayStart, percent, readCompaniesFrom, viaLabel } from "./report";
import { FUNNEL_STEPS } from "./steps";

// Отчёт пилота одной командой (auto-tasks-metrics-1 M03): что получилось,
// где отвалились люди. Владелец пересылает его команде как есть, поэтому
// текст по-русски, разделами и влезает в одно сообщение Telegram. Только
// числа: ни id, ни имён, ни названия игры, ни кода приглашения. Сроки
// (медианы) считает SQL, id из запросов не выходят.

const DAY_MS = 24 * 3600_000;
// Меньше — доли почти называют людей: только «мало данных».
export const MIN_GROUP = 5;
export const TELEGRAM_LIMIT = 4096;
const ENOUGH_WISHES = 3;

// Шаги, которых ещё может не быть (M04, M10): строка появится в отчёте, когда
// шаг попадёт в FUNNEL_STEPS.
const known = (step: string) =>
  (FUNNEL_STEPS as readonly string[]).includes(step);

// Только профиль и то, что человек видел, — «ничего не сделал».
const PASSIVE_STEPS = [
  "profile_created",
  "in_app_browser_seen",
  "pwa_standalone",
  "session_expired_seen",
  "offline_seen",
  "rate_limited_seen",
];

// Снимок готовности при жеребьёвке (M04): только числа.
const SnapshotSchema = z.object({
  members: z.number(),
  invitedDropped: z.number(),
  withWishlist: z.number(),
  enoughInBudget: z.number(),
});

export type PilotOptions = {
  // false — бот выключен (нет TELEGRAM_BOT_TOKEN).
  botEnabled?: boolean;
  // Код приглашения в игру (короткая ссылка). Нет — самая большая игра
  // периода с не своими участниками.
  gameCode?: string;
  // Свои профили и репетиция — только для проверки (M01).
  includeInternal?: boolean;
  now: number;
  // ГГГГ-ММ-ДД, по поясу процесса (M11: по Бишкеку).
  since: string;
  // Пояс календаря продукта: «до обмена» — до полуночи после дня обмена.
  timeZone: string;
};

export type PilotSanta = {
  boughtBeforeExchange: number;
  bought: number;
  // После M04 — купили желание из вишлиста подопечного.
  boughtFromWishlist?: number;
  bot: {
    failed: number;
    reasons: Array<{ count: number; reason: string }>;
    sent: number;
    waiting: number;
  };
  // Найдена по коду или выбрана как самая большая.
  byCode: boolean;
  drawn: boolean;
  emptyWishlist: number;
  exchangeDate: string;
  exchangePassed: boolean;
  gamesInPeriod: number;
  invited: number;
  joinHours: null | number;
  joined: number;
  openHours: null | number;
  opened: number;
  removed: number;
  // Снимок готовности при жеребьёвке (M04).
  snapshot?: z.infer<typeof SnapshotSchema>;
};

export type PilotCohort = {
  outsiders: number;
  plans: number;
  // null — обмен ещё не прошёл.
  returned: null | number;
  shared: number;
  size: number;
};

export type PilotData = {
  cohort: PilotCohort;
  errors: null | {
    byCode: Array<{ code: string; count: number }>;
    byDay: Array<{ count: number; day: string }>;
  };
  goals: {
    companies: number;
    steps: Record<string, number>;
  };
  includeInternal: boolean;
  people: {
    byVia: Array<{ count: number; via: null | string }>;
    deleted: number;
    idle: number;
    merged?: number;
    restored?: number;
    telegram: number;
  };
  santa: null | PilotSanta;
  since: string;
  until: string;
  botEnabled: boolean;
};

type GameRow = { id: string };

// Игра: по коду приглашения — какой бы давней ни была; без кода — самая
// большая среди тех, где обмен не раньше начала периода и есть не свои.
const findGame = async (
  db: Database,
  options: PilotOptions,
): Promise<{ count: number; game: GameRow | null } | { message: string }> => {
  const internalOk = Boolean(options.includeInternal);
  const { rows } = await db.execute<{ id: string; people: number }>(sql`
    select g.id, count(m.user_id)::int as people
    from santa_games g
    join santa_members m on m.game_id = g.id and m.state = 'joined'
    join users u on u.id = m.user_id
    where g.exchange_date >= ${options.since}
      and (${internalOk} or not u.funnel_internal)
    group by g.id
    order by people desc, g.id
  `);
  if (options.gameCode === undefined) {
    const first = rows[0];
    return { count: rows.length, game: first ? { id: first.id } : null };
  }
  const [link] = await db
    .select({ kind: shareLinks.kind, targetId: shareLinks.targetId })
    .from(shareLinks)
    .where(eq(shareLinks.code, options.gameCode))
    .limit(1);
  if (!link || link.kind !== "santa") {
    return { message: "Нет приглашения в игру с таким кодом" };
  }
  return { count: rows.length, game: { id: link.targetId } };
};

const readSanta = async (
  db: Database,
  gameId: string,
  options: PilotOptions,
  gamesInPeriod: number,
): Promise<PilotSanta | null> => {
  const internalOk = Boolean(options.includeInternal);
  const { rows } = await db.execute<{
    bought: number;
    bought_in_time: number;
    drawn: boolean;
    empty_wishlist: number;
    exchange_date: string;
    exchange_passed: boolean;
    from_wishlist: number;
    invited: number;
    join_hours: null | number;
    joined: number;
    open_hours: null | number;
    opened: number;
    removed: number;
    snapshot: unknown;
  }>(sql`
    with game as (
      select g.id, g.owner_id, g.drawn_at, g.status,
        g.exchange_date::text as exchange_date,
        (g.exchange_date + 1)::timestamp at time zone ${options.timeZone}
          as exchange_end,
        coalesce(
          (select min(l.created_at) from share_links l
            where l.kind = 'santa' and l.target_id = g.id),
          g.created_at
        ) as invited_at,
        cardinality(g.removed_ids) as removed,
        -- Снимок при жеребьёвке (M04): колонки может ещё не быть.
        to_jsonb(g) -> 'draw_snapshot' as snapshot
      from santa_games g where g.id = ${gameId}
    ),
    people as (
      select m.*, u.funnel_steps,
        exists (
          select 1 from wishlist_items w
          where w.owner_id = m.user_id and w.status = 'active'
            and w.deleted_at is null
        ) as has_wishes
      from santa_members m
      join users u on u.id = m.user_id
      where m.game_id = ${gameId}
        and (${internalOk} or not u.funnel_internal)
    )
    select
      g.exchange_date,
      g.status = 'drawn' as drawn,
      g.exchange_end <= ${new Date(options.now)} as exchange_passed,
      g.removed,
      g.snapshot,
      count(p.user_id)::int as invited,
      count(p.user_id) filter (where p.state = 'joined')::int as joined,
      percentile_cont(0.5) within group (
        order by extract(epoch from p.joined_at - g.invited_at)::float8 / 3600
      ) filter (
        where p.state = 'joined' and p.user_id <> g.owner_id
          and p.joined_at >= g.invited_at
      ) as join_hours,
      count(p.user_id) filter (
        where p.state = 'joined' and p.opened_at is not null
      )::int as opened,
      percentile_cont(0.5) within group (
        order by extract(epoch from p.opened_at - g.drawn_at)::float8 / 3600
      ) filter (
        where p.state = 'joined' and p.opened_at >= g.drawn_at
      ) as open_hours,
      count(p.user_id) filter (
        where p.state = 'joined' and p.bought_at is not null
      )::int as bought,
      count(p.user_id) filter (
        where p.state = 'joined' and p.bought_at < g.exchange_end
      )::int as bought_in_time,
      count(p.user_id) filter (
        where p.state = 'joined'
          and 'santa_bought_from_wishlist' = any(p.funnel_steps)
      )::int as from_wishlist,
      count(p.user_id) filter (
        where p.state = 'joined' and not p.has_wishes
      )::int as empty_wishlist
    from game g
    left join people p on true
    group by g.exchange_date, g.status, g.exchange_end, g.removed, g.snapshot
  `);
  const row = rows[0];
  if (!row) return null;

  const bot = await db.execute<{
    reason: null | string;
    sent: boolean;
    waiting: boolean;
    n: number;
  }>(sql`
    select n.sent_at is not null as sent,
      n.sent_at is null and n.next_at is not null as waiting,
      case when n.sent_at is null and n.next_at is null then n.error end
        as reason,
      count(*)::int as n
    from notifications n
    join users u on u.id = n.user_id
    where n.ref_id = ${gameId} and (${internalOk} or not u.funnel_internal)
    group by 1, 2, 3
  `);
  const sum = (pick: (r: (typeof bot.rows)[number]) => boolean) =>
    bot.rows.filter(pick).reduce((total, r) => total + r.n, 0);
  const reasons = new Map<string, number>();
  for (const r of bot.rows) {
    if (r.sent || r.waiting) continue;
    const reason = r.reason ?? "unknown";
    reasons.set(reason, (reasons.get(reason) ?? 0) + r.n);
  }
  const snapshot = SnapshotSchema.safeParse(row.snapshot);

  return {
    byCode: options.gameCode !== undefined,
    gamesInPeriod,
    exchangeDate: row.exchange_date,
    exchangePassed: row.exchange_passed,
    drawn: row.drawn,
    invited: row.invited,
    joined: row.joined,
    joinHours: row.join_hours,
    opened: row.opened,
    openHours: row.open_hours,
    bought: row.bought,
    boughtBeforeExchange: row.bought_in_time,
    ...(known("santa_bought_from_wishlist")
      ? { boughtFromWishlist: row.from_wishlist }
      : {}),
    emptyWishlist: row.empty_wishlist,
    removed: row.removed,
    ...(snapshot.success ? { snapshot: snapshot.data } : {}),
    bot: {
      sent: sum((r) => r.sent),
      waiting: sum((r) => r.waiting),
      failed: sum((r) => !r.sent && !r.waiting),
      reasons: [...reasons].map(([reason, count]) => ({ reason, count })),
    },
  };
};

export const readPilot = async (
  db: Database,
  options: PilotOptions,
): Promise<{ data: PilotData; ok: true } | { message: string; ok: false }> => {
  const internalOk = Boolean(options.includeInternal);
  const since = dayStart(options.since);
  const dayAgo = new Date(options.now - DAY_MS);

  const found = await findGame(db, options);
  if ("message" in found) return { ok: false, message: found.message };
  const santa = found.game
    ? await readSanta(db, found.game.id, options, found.count)
    : null;

  const byVia = (
    await db.execute<{ n: number; via: null | string }>(sql`
      select created_via as via, count(*)::int as n from users
      where created_at >= ${since} and deleted_at is null
        and (${internalOk} or not funnel_internal)
      group by created_via
      order by n desc, created_via
    `)
  ).rows.map((row) => ({ via: row.via, count: row.n }));

  const [people] = (
    await db.execute<{ deleted: number; idle: number; telegram: number }>(sql`
      select
        (select count(*)::int from users
          where created_at >= ${since} and created_at <= ${dayAgo}
            and deleted_at is null
            and (${internalOk} or not funnel_internal)
            and funnel_steps <@ ${sql.raw(
              `array[${PASSIVE_STEPS.map((step) => `'${step}'`).join(", ")}]::text[]`,
            )}
        ) as idle,
        (select count(*)::int from users
          where deleted_at >= ${since}
            and (${internalOk} or not funnel_internal)) as deleted,
        (select count(distinct i.user_id)::int from identities i
          join users u on u.id = i.user_id
          where i.provider = 'telegram' and i.created_at >= ${since}
            and (${internalOk} or not u.funnel_internal)) as telegram
    `)
  ).rows;

  // Когорта «пришли по приглашению в Санту» (M02, M06): что было вокруг.
  const exchangeEnd =
    santa && santa.exchangePassed
      ? new Date(dayStart(santa.exchangeDate).getTime() + DAY_MS)
      : null;
  const [cohort] = (
    await db.execute<{
      outsiders: number;
      plans: number;
      returned: number;
      shared: number;
      size: number;
    }>(sql`
      select count(*)::int as size,
        count(*) filter (
          where 'wishlist_shared' = any(u.funnel_steps))::int as shared,
        count(*) filter (where 'plan_created' = any(u.funnel_steps))::int
          as plans,
        count(*) filter (where exists (
          select 1 from wishlist_views v
          where v.owner_id = u.id and not exists (
            select 1 from santa_members a
            join santa_members b on b.game_id = a.game_id
            where a.user_id = u.id and b.user_id = v.viewer_id
          )
        ))::int as outsiders,
        count(*) filter (where exists (
          select 1 from sessions s
          where s.user_id = u.id
            and s.last_used_at >= ${exchangeEnd ?? new Date(options.now)}
        ))::int as returned
      from users u
      where u.created_via = 'santa_invite' and u.created_at >= ${since}
        and (${internalOk} or not u.funnel_internal)
    `)
  ).rows;

  const steps = Object.fromEntries(
    (
      await db
        .select({
          step: funnelDaily.step,
          total: sql<number>`sum(${funnelDaily.count})::int`,
        })
        .from(funnelDaily)
        .where(gte(funnelDaily.day, options.since))
        .groupBy(funnelDaily.step)
    ).map((row) => [row.step, row.total]),
  );

  // Ошибки по дням (M05, errors_daily): без своих и репетиции, если не
  // просили. Текст свой — по-русски и короче, чем в ops-отчёте.
  const byCode = new Map<string, number>();
  const byDay = new Map<string, number>();
  for (const row of await readErrorsDaily(db, options.since)) {
    const n = internalOk ? row.count : row.count - row.internal;
    if (n <= 0) continue;
    byCode.set(row.code, (byCode.get(row.code) ?? 0) + n);
    byDay.set(row.day, (byDay.get(row.day) ?? 0) + n);
  }

  return {
    ok: true,
    data: {
      since: options.since,
      until: toDateKey(options.now),
      includeInternal: internalOk,
      botEnabled: options.botEnabled ?? true,
      people: {
        byVia,
        idle: people?.idle ?? 0,
        deleted: people?.deleted ?? 0,
        telegram: people?.telegram ?? 0,
        ...(known("profile_merged")
          ? { merged: steps.profile_merged ?? 0 }
          : {}),
        ...(known("telegram_restored")
          ? { restored: steps.telegram_restored ?? 0 }
          : {}),
      },
      santa,
      cohort: {
        size: cohort?.size ?? 0,
        shared: cohort?.shared ?? 0,
        outsiders: cohort?.outsiders ?? 0,
        plans: cohort?.plans ?? 0,
        returned: exchangeEnd ? (cohort?.returned ?? 0) : null,
      },
      goals: {
        companies: await readCompaniesFrom(db, since),
        steps,
      },
      errors: {
        byCode: [...byCode]
          .map(([code, count]) => ({ code, count }))
          .sort((a, b) => b.count - a.count || a.code.localeCompare(b.code)),
        byDay: [...byDay]
          .map(([day, count]) => ({ day, count }))
          .sort((a, b) => a.day.localeCompare(b.day)),
      },
    },
  };
};

// ── Текст ──────────────────────────────────────────────────────────────

const date = (day: string) =>
  `${day.slice(8, 10)}.${day.slice(5, 7)}.${day.slice(0, 4)}`;
const shortDate = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

const hours = (value: null | number) => {
  if (value === null) return "—";
  if (value < 1) return "меньше часа";
  if (value < 48) return `${Math.round(value)} ч`;
  return `${Math.round(value / 24)} дн.`;
};

// «a из b (p%)»; в маленькой группе — без доли.
const share = (part: number, whole: number) =>
  whole >= MIN_GROUP
    ? `${part} из ${whole} (${percent(part, whole)})`
    : `${part} из ${whole}`;

const ERROR_LABELS: Record<string, string> = {
  INTERNAL: "сбой сервера",
  RATE_LIMITED: "«слишком часто»",
  UNAUTHORIZED: "нет входа",
  FORBIDDEN: "нет доступа",
  CONFLICT: "конфликт",
  VALIDATION: "неверные данные",
  NOT_FOUND: "не найдено",
  HEALTH_503: "сервер не видел базу (/health 503)",
};

const BOT_REASONS: Record<string, string> = {
  blocked: "заблокировали бота",
  no_chat: "не открывали бота",
  disabled: "выключили уведомления",
  network: "нет связи с Telegram",
  sender: "сбой отправки",
  unknown: "без причины",
};
const botReason = (reason: string) =>
  BOT_REASONS[reason] ??
  (reason.startsWith("http_") ? "ошибка Telegram" : "другое");

const formatSanta = (santa: PilotSanta, botEnabled: boolean): string[] => {
  const lines = [
    `Санта — ${santa.byCode ? "игра по коду" : `самая большая игра периода (всего игр: ${santa.gamesInPeriod})`}, обмен ${date(santa.exchangeDate)}`,
  ];
  if (santa.joined < MIN_GROUP) {
    lines.push(
      `  в игре ${santa.joined} чел. — меньше ${MIN_GROUP}, мало данных`,
    );
    return lines;
  }
  lines.push(
    `  вступили ${share(santa.joined, santa.invited)} позванных; от ссылки до вступления — ${hours(santa.joinHours)} (медиана)`,
  );
  if (santa.snapshot) {
    const s = santa.snapshot;
    lines.push(
      `  к жеребьёвке: с вишлистом ${share(s.withWishlist, s.members)}, ${ENOUGH_WISHES}+ желания в бюджете ${share(s.enoughInBudget, s.members)}, позваны и не вступили ${s.invitedDropped}`,
    );
  }
  if (!santa.drawn) {
    lines.push("  жеребьёвки ещё не было");
  } else {
    lines.push(
      `  открыли письмо ${share(santa.opened, santa.joined)}; от жеребьёвки до письма — ${hours(santa.openHours)} (медиана)`,
      `  купили ${share(santa.bought, santa.joined)}, из них до обмена ${santa.boughtBeforeExchange}${santa.boughtFromWishlist === undefined ? "" : `, из вишлиста подопечного ${santa.boughtFromWishlist}`}`,
    );
  }
  lines.push(
    `  с пустым вишлистом (их Санте не из чего выбрать): ${santa.emptyWishlist}`,
    `  убрал организатор: ${santa.removed}`,
  );
  const { bot } = santa;
  if (!botEnabled) {
    lines.push("  бот выключен: сообщения только в журнале");
  } else if (bot.sent + bot.waiting + bot.failed === 0) {
    lines.push("  бот: сообщений не было");
  } else {
    const reasons = bot.reasons
      .map(({ reason, count }) => `${botReason(reason)} ${count}`)
      .join(", ");
    lines.push(
      `  бот: дошло ${bot.sent}, ждёт ${bot.waiting}, не дошло ${bot.failed}${reasons ? ` (${reasons})` : ""}`,
    );
  }
  return lines;
};

export const formatPilot = (data: PilotData): string => {
  const { people, cohort, goals } = data;
  const step = (name: string) => goals.steps[name] ?? 0;
  const created = people.byVia.reduce((sum, row) => sum + row.count, 0);
  const lines = [
    `Отчёт пилота SwipeIt: ${date(data.since)} — ${date(data.until)} (время Бишкека)`,
    ...(data.includeInternal
      ? ["Со своими профилями и репетицией — только для проверки."]
      : []),
    "",
    "Люди",
    `  новых профилей: ${created}${people.byVia.length > 0 ? ` — ${people.byVia.map((row) => `${viaLabel(row.via)} ${row.count}`).join(", ")}` : ""}`,
    `  ничего не сделали (профилю больше суток): ${people.idle}`,
    `  удалили профиль: не меньше ${people.deleted}`,
    `  вошли через Telegram: ${people.telegram}`,
    ...(people.restored === undefined
      ? []
      : [`  вернули профиль через Telegram: ${people.restored}`]),
    ...(people.merged === undefined
      ? []
      : [`  слились при входе (дубли): ${people.merged}`]),
    "",
    ...(data.santa
      ? formatSanta(data.santa, data.botEnabled)
      : ["Санта — игр с не своими участниками за период нет"]),
    "",
    "Вокруг Санты (пришли по приглашению в игру)",
  ];
  if (cohort.size < MIN_GROUP) {
    lines.push(
      `  пришли ${cohort.size} чел. — меньше ${MIN_GROUP}, мало данных`,
    );
  } else {
    lines.push(
      `  пришли: ${cohort.size}`,
      `  отправили свой вишлист: ${share(cohort.shared, cohort.size)}`,
      `  их вишлист открыли люди не из игры: ${share(cohort.outsiders, cohort.size)}`,
      `  создали план: ${share(cohort.plans, cohort.size)}`,
      cohort.returned === null
        ? "  заходили после обмена: обмен ещё не прошёл"
        : `  заходили после обмена: ${share(cohort.returned, cohort.size)}`,
    );
  }

  const feed = step("first_swipe_feed");
  const shared = step("wishlist_shared");
  lines.push(
    "",
    "Цели PRD",
    `  §4 п. 3 — компаний (3+ не своих человека дошли до «Решено» или жеребьёвки): ${goals.companies}`,
    feed < MIN_GROUP
      ? `  §4 п. 4 — первый свайп за 10 секунд: мало данных (${feed} чел. из ленты)`
      : `  §4 п. 4 — первый свайп за 10 секунд: ${share(step("first_swipe_10s"), feed)} из ленты и по ссылке на вишлист`,
    `  §7.4 — прошли 20+ карточек (свайпают дольше минуты): ${share(step("swipes_20"), step("first_swipe"))}`,
    `  §7.4 — назвали день рождения при отправке: ${share(step("share_with_birthday"), shared)}`,
    `  §7.4 — как отправляли: «Поделиться» ${step("share_channel_system")}, ссылка ${step("share_channel_copy")}, QR ${step("share_channel_qr")} (из ${shared} отправивших)`,
    "",
  );
  if (!data.errors || data.errors.byCode.length === 0) {
    lines.push("Сбои за период: не было");
  } else {
    lines.push(
      "Сбои за период",
      `  ${data.errors.byCode.map(({ code, count }) => `${ERROR_LABELS[code] ?? "другое"} ${count}`).join(", ")}`,
      `  по дням: ${data.errors.byDay.map(({ day, count }) => `${shortDate(day)} — ${count}`).join(", ")}`,
    );
  }
  return lines.join("\n");
};

// Для команды и для GET /v1/ops/report?pilot=1.
export const buildPilotReport = async (
  db: Database,
  options: PilotOptions,
): Promise<{ ok: true; text: string } | { message: string; ok: false }> => {
  const result = await readPilot(db, options);
  if (!result.ok) return result;
  return { ok: true, text: formatPilot(result.data) };
};
