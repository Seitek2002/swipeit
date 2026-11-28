import { toDateKey } from "@swipeit/core/format";
import { sql } from "drizzle-orm";

import type { ServerCatalog } from "../../catalog/load";
import type { Database } from "../../db/client";
import { NOTIFICATION_KINDS } from "../../db/schema";

// Раздел «Сейчас» отчёта живого прогона (auto-tasks-pm-3 R02): что
// происходит в играх и планах прямо сейчас. Только числа — ни названий, ни
// id: отчёт уходит владельцу текстом.
//
// Служебные игры и планы (auto-tasks-metrics-1 M01) — где организатор и все
// вступившие помечены своими (репетиция, телефоны команды) — не
// показываются, только их число. includeInternal — показать и их: шаг 10
// репетиции проверяет свою игру.
//
// Бот (M09): по видам сообщений — ушло, ждёт, не дошло и почему; по игре —
// сколько участников бот может достать. Без текстов, адресатов и ref_id.

const DAY_MS = 24 * 3600_000;
const QUIET_DAYS = 14;
const ENOUGH_WISHES = 3;

export type LiveSantaGathering = {
  // Могут получать бота: вошли через Telegram, есть chat_id, не выключили,
  // не заблокировали (M09).
  botReachable: number;
  enoughInBudget: number;
  invitedPending: number;
  members: number;
  withWishlist: number;
};
export type LiveSantaDrawn = {
  botReachable: number;
  bought: number;
  members: number;
  noWard: number;
  opened: number;
};
// Сообщения бота одного вида за 14 дней (M09).
export type LiveBotKind = {
  // Не ушло, и больше не пробуем.
  gaveUp: number;
  kind: string;
  // Ещё попробуем: в очереди или повтор после ошибки.
  pending: number;
  // Почему не ушло (blocked, no_chat, disabled, http_*…) — у ждущих
  // повтора и у брошенных.
  reasons: Record<string, number>;
  sent: number;
};
export type LiveReport = {
  bot: {
    // false — TELEGRAM_BOT_TOKEN не задан; нет поля — неизвестно (CLI).
    enabled?: boolean;
    kinds: LiveBotKind[];
  };
  drawFailed: number;
  // Скрытые служебные игры и планы (M01); с includeInternal — 0.
  hidden: { plans: number; santa: number };
  plans: { avgSize: number; byStatus: Record<string, number> };
  santaDrawn: LiveSantaDrawn[];
  santaGathering: LiveSantaGathering[];
};

export type LiveOptions = {
  botEnabled?: boolean;
  includeInternal?: boolean;
};

type WishRow = {
  custom: null | { priceMax?: number; priceMin?: number };
  owner_id: string;
  product_id: null | string;
};

// Метка причины — только «словом»: в отчёт не попадёт ничего, кроме метки.
const REASON = /^[a-z][a-z0-9_]{0,31}$/;

const idList = (list: readonly string[]) =>
  sql.join(
    list.map((id) => sql`${id}`),
    sql`, `,
  );

export const readLive = async (
  db: Database,
  catalog: ServerCatalog,
  now: number,
  { botEnabled, includeInternal = false }: LiveOptions = {},
): Promise<LiveReport> => {
  const since = new Date(now - QUIET_DAYS * DAY_MS);
  const today = toDateKey(now - QUIET_DAYS * DAY_MS);
  // Игры, где обмен не прошёл больше 14 дней назад.
  const games = (
    await db.execute<{
      budget: number;
      draw_failed: boolean;
      id: string;
      owner_id: string;
      status: string;
    }>(sql`
      select id, budget, status, owner_id,
        draw_failed_at is not null as draw_failed
      from santa_games where exchange_date >= ${today}
    `)
  ).rows;
  const members = (
    await db.execute<{
      bought: boolean;
      game_id: string;
      opened: boolean;
      state: string;
      user_id: string;
    }>(sql`
      select game_id, user_id, state, opened_at is not null as opened,
        bought_at is not null as bought
      from santa_members
      where game_id in (
        select id from santa_games where exchange_date >= ${today}
      )
    `)
  ).rows;
  const wardless = new Set(
    (
      await db.execute<{ game_id: string; user_id: string }>(sql`
        select m.game_id, m.user_id from santa_members m
        join santa_games g on g.id = m.game_id
        where g.status = 'drawn' and m.state = 'joined'
          and g.exchange_date >= ${today}
          and not exists (
            select 1 from santa_assignments a
            where a.game_id = m.game_id and a.santa_id = m.user_id
          )
      `)
    ).rows.map((row) => `${row.game_id}:${row.user_id}`),
  );
  const people = [
    ...new Set([
      ...members.map((member) => member.user_id),
      ...games.map((game) => game.owner_id),
    ]),
  ];
  const wishes =
    people.length === 0
      ? []
      : (
          await db.execute<WishRow>(sql`
            select owner_id, product_id, custom from wishlist_items
            where status = 'active' and deleted_at is null
              and owner_id in (${idList(people)})
          `)
        ).rows;
  // Свои профили (M01) и кого бот может достать (M09).
  const flags =
    people.length === 0
      ? []
      : (
          await db.execute<{ bot: boolean; id: string; internal: boolean }>(
            sql`
              select u.id, u.funnel_internal as internal,
                exists (
                  select 1 from identities i
                  where i.user_id = u.id and i.provider = 'telegram'
                    and i.chat_id is not null and i.bot_messages
                    and i.bot_blocked_at is null
                ) as bot
              from users u where u.id in (${idList(people)})
            `,
          )
        ).rows;
  const internalPeople = new Set(
    flags.filter((row) => row.internal).map((row) => row.id),
  );
  const botPeople = new Set(
    flags.filter((row) => row.bot).map((row) => row.id),
  );
  const minPrice = (wish: WishRow): null | number => {
    if (wish.product_id) {
      return catalog.productsById.get(wish.product_id)?.priceMin ?? null;
    }
    return wish.custom?.priceMin ?? wish.custom?.priceMax ?? null;
  };
  const wishesOf = new Map<string, WishRow[]>();
  for (const wish of wishes) {
    wishesOf.set(wish.owner_id, [...(wishesOf.get(wish.owner_id) ?? []), wish]);
  }

  const santaGathering: LiveSantaGathering[] = [];
  const santaDrawn: LiveSantaDrawn[] = [];
  let hiddenSanta = 0;
  let drawFailed = 0;
  for (const game of games) {
    const mine = members.filter((member) => member.game_id === game.id);
    const joined = mine.filter((member) => member.state === "joined");
    const service =
      internalPeople.has(game.owner_id) &&
      joined.every((member) => internalPeople.has(member.user_id));
    if (service && !includeInternal) {
      hiddenSanta += 1;
      continue;
    }
    if (game.draw_failed) drawFailed += 1;
    const botReachable = joined.filter((member) =>
      botPeople.has(member.user_id),
    ).length;
    if (game.status === "gathering") {
      santaGathering.push({
        botReachable,
        members: joined.length,
        invitedPending: mine.length - joined.length,
        withWishlist: joined.filter(
          (member) => (wishesOf.get(member.user_id) ?? []).length > 0,
        ).length,
        enoughInBudget: joined.filter(
          (member) =>
            (wishesOf.get(member.user_id) ?? []).filter((wish) => {
              const price = minPrice(wish);
              return price !== null && price <= game.budget;
            }).length >= ENOUGH_WISHES,
        ).length,
      });
    } else {
      santaDrawn.push({
        botReachable,
        members: joined.length,
        opened: joined.filter((member) => member.opened).length,
        bought: joined.filter((member) => member.bought).length,
        noWard: joined.filter((member) =>
          wardless.has(`${game.id}:${member.user_id}`),
        ).length,
      });
    }
  }
  santaGathering.sort((a, b) => b.members - a.members);
  santaDrawn.sort((a, b) => b.members - a.members);

  // Планы: созданные за 14 дней или с дедлайном впереди. Служебный план
  // (M01) — организатор и все участники свои.
  const allPlanRows = (
    await db.execute<{ service: boolean; size: number; status: string }>(sql`
      select p.status,
        (select count(*)::int from plan_participants pp
          where pp.plan_id = p.id) as size,
        coalesce(
          (select o.funnel_internal from users o where o.id = p.owner_id),
          false
        ) and not exists (
          select 1 from plan_participants pp
          join users u on u.id = pp.user_id
          where pp.plan_id = p.id and not u.funnel_internal
        ) as service
      from plans p
      where p.created_at >= ${since} or p.deadline >= ${new Date(now)}
    `)
  ).rows;
  const planRows = includeInternal
    ? allPlanRows
    : allPlanRows.filter((row) => !row.service);
  const byStatus: Record<string, number> = {
    lobby: 0,
    swiping: 0,
    results: 0,
    decided: 0,
  };
  for (const row of planRows) {
    byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  }
  const avgSize =
    planRows.length === 0
      ? 0
      : planRows.reduce((sum, row) => sum + row.size, 0) / planRows.length;

  return {
    santaGathering,
    santaDrawn,
    drawFailed,
    hidden: { santa: hiddenSanta, plans: allPlanRows.length - planRows.length },
    plans: { byStatus, avgSize },
    bot: {
      ...(botEnabled === undefined ? {} : { enabled: botEnabled }),
      kinds: await readBotKinds(db, since, includeInternal),
    },
  };
};

// Сообщения бота за 14 дней по видам (M09): только числа и метки причин.
// Сообщения своим профилям не в счёт, если не просили служебное.
const readBotKinds = async (
  db: Database,
  since: Date,
  includeInternal: boolean,
): Promise<LiveBotKind[]> => {
  const rows = (
    await db.execute<{
      error: null | string;
      kind: string;
      n: number;
      state: "gave_up" | "pending" | "sent";
    }>(sql`
      select n.kind,
        case when n.sent_at is not null then 'sent'
          when n.next_at is not null then 'pending'
          else 'gave_up' end as state,
        case when n.sent_at is null then n.error end as error,
        count(*)::int as n
      from notifications n
      join users u on u.id = n.user_id
      where n.created_at >= ${since}
        and (${includeInternal}::boolean or not u.funnel_internal)
      group by 1, 2, 3
    `)
  ).rows;
  const byKind = new Map<string, LiveBotKind>();
  for (const row of rows) {
    const entry = byKind.get(row.kind) ?? {
      kind: row.kind,
      sent: 0,
      pending: 0,
      gaveUp: 0,
      reasons: {},
    };
    if (row.state === "sent") entry.sent += row.n;
    else if (row.state === "pending") entry.pending += row.n;
    else entry.gaveUp += row.n;
    if (row.error) {
      const reason = REASON.test(row.error) ? row.error : "other";
      entry.reasons[reason] = (entry.reasons[reason] ?? 0) + row.n;
    }
    byKind.set(row.kind, entry);
  }
  const order: readonly string[] = NOTIFICATION_KINDS;
  return [...byKind.values()].sort(
    (a, b) => order.indexOf(a.kind) - order.indexOf(b.kind),
  );
};

// Виды сообщений бота — по-русски, для владельца.
const BOT_KIND_LABELS: Record<string, string> = {
  santa_drawn: "Санта: жеребьёвка прошла",
  santa_new_letter: "Санта: новое письмо",
  santa_draw_failed: "Санта: жеребьёвка по дате не прошла",
  santa_draw_tomorrow: "Санта: завтра жеребьёвка",
  santa_exchange_soon: "Санта: скоро обмен",
  plan_results: "План: итоги готовы",
};

export const formatBot = (bot: LiveReport["bot"]): string[] => {
  const lines = ["Бот в Telegram (сообщения за 14 дней):"];
  if (bot.enabled === false) {
    lines.push("  бот выключен: сообщения только в журнале");
  }
  if (bot.kinds.length === 0) lines.push("  —");
  for (const kind of bot.kinds) {
    const reasons = Object.entries(kind.reasons)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, n]) => `${reason} ${n}`);
    const label = BOT_KIND_LABELS[kind.kind] ?? "другое";
    lines.push(
      `  ${label}: ушло ${kind.sent}, ждёт ${kind.pending}, не дошло ${kind.gaveUp}${reasons.length > 0 ? `; причины: ${reasons.join(", ")}` : ""}`,
    );
  }
  return lines;
};

const plural = (n: number, forms: [string, string, string]) => {
  const tail = n % 100;
  if (tail >= 11 && tail <= 14) return forms[2];
  if (n % 10 === 1) return forms[0];
  if (n % 10 >= 2 && n % 10 <= 4) return forms[1];
  return forms[2];
};

export const formatLive = (live: LiveReport): string => {
  const lines = ["Сейчас (игры и планы, активные за 14 дней):", ""];
  lines.push("Санта в сборе:");
  if (live.santaGathering.length === 0) lines.push("  —");
  live.santaGathering.forEach((game, index) => {
    lines.push(
      `  игра ${index + 1}: ${game.members} ${plural(game.members, ["участник", "участника", "участников"])}, ${game.invitedPending} позваны и не вступили, с вишлистом ${game.withWishlist}, из них ${ENOUGH_WISHES}+ желания в бюджете — ${game.enoughInBudget}; могут получать бота: ${game.botReachable} из ${game.members}`,
    );
  });
  lines.push("Санта после жеребьёвки:");
  if (live.santaDrawn.length === 0) lines.push("  —");
  live.santaDrawn.forEach((game, index) => {
    lines.push(
      `  игра ${index + 1}: открыли письмо ${game.opened} из ${game.members}, купили ${game.bought} из ${game.members}, без подопечного ${game.noWard}; могут получать бота: ${game.botReachable} из ${game.members}`,
    );
  });
  lines.push(`Жеребьёвка по дате не прошла: ${live.drawFailed}`);
  const { byStatus, avgSize } = live.plans;
  lines.push(
    `Планы: лобби ${byStatus.lobby ?? 0}, колода ${byStatus.swiping ?? 0}, итоги ${byStatus.results ?? 0}, решено ${byStatus.decided ?? 0}; средний размер ${avgSize.toFixed(1)}`,
  );
  lines.push("", ...formatBot(live.bot));
  // Служебные (M01): репетиция и телефоны команды — только число.
  lines.push(
    "",
    `служебных игр скрыто: ${live.hidden.santa}, служебных планов скрыто: ${live.hidden.plans} (репетиция и свои профили)`,
  );
  return lines.join("\n");
};
