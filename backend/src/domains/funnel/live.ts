import { toDateKey } from "@swipeit/core/format";
import { sql } from "drizzle-orm";

import type { ServerCatalog } from "../../catalog/load";
import type { Database } from "../../db/client";

// Раздел «Сейчас» отчёта живого прогона (auto-tasks-pm-3 R02): что
// происходит в играх и планах прямо сейчас. Только числа — ни названий, ни
// id: отчёт уходит владельцу текстом.

const DAY_MS = 24 * 3600_000;
const QUIET_DAYS = 14;
const ENOUGH_WISHES = 3;

export type LiveSantaGathering = {
  enoughInBudget: number;
  invitedPending: number;
  members: number;
  withWishlist: number;
};
export type LiveSantaDrawn = {
  bought: number;
  members: number;
  noWard: number;
  opened: number;
};
export type LiveReport = {
  drawFailed: number;
  plans: { avgSize: number; byStatus: Record<string, number> };
  santaDrawn: LiveSantaDrawn[];
  santaGathering: LiveSantaGathering[];
};

type WishRow = {
  custom: null | { priceMax?: number; priceMin?: number };
  owner_id: string;
  product_id: null | string;
};

export const readLive = async (
  db: Database,
  catalog: ServerCatalog,
  now: number,
): Promise<LiveReport> => {
  const since = new Date(now - QUIET_DAYS * DAY_MS);
  const today = toDateKey(now - QUIET_DAYS * DAY_MS);
  // Игры, где обмен не прошёл больше 14 дней назад.
  const games = (
    await db.execute<{
      budget: number;
      draw_failed: boolean;
      id: string;
      status: string;
    }>(sql`
      select id, budget, status, draw_failed_at is not null as draw_failed
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
  const people = [...new Set(members.map((member) => member.user_id))];
  const wishes =
    people.length === 0
      ? []
      : (
          await db.execute<WishRow>(sql`
            select owner_id, product_id, custom from wishlist_items
            where status = 'active' and deleted_at is null
              and owner_id in (${sql.join(
                people.map((id) => sql`${id}`),
                sql`, `,
              )})
          `)
        ).rows;
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
  for (const game of games) {
    const mine = members.filter((member) => member.game_id === game.id);
    const joined = mine.filter((member) => member.state === "joined");
    if (game.status === "gathering") {
      santaGathering.push({
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

  // Планы: созданные за 14 дней или с дедлайном впереди.
  const planRows = (
    await db.execute<{ size: number; status: string }>(sql`
      select p.status,
        (select count(*)::int from plan_participants pp
          where pp.plan_id = p.id) as size
      from plans p
      where p.created_at >= ${since} or p.deadline >= ${new Date(now)}
    `)
  ).rows;
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
    drawFailed: games.filter((game) => game.draw_failed).length,
    plans: { byStatus, avgSize },
  };
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
      `  игра ${index + 1}: ${game.members} ${plural(game.members, ["участник", "участника", "участников"])}, ${game.invitedPending} позваны и не вступили, с вишлистом ${game.withWishlist}, из них ${ENOUGH_WISHES}+ желания в бюджете — ${game.enoughInBudget}`,
    );
  });
  lines.push("Санта после жеребьёвки:");
  if (live.santaDrawn.length === 0) lines.push("  —");
  live.santaDrawn.forEach((game, index) => {
    lines.push(
      `  игра ${index + 1}: открыли письмо ${game.opened} из ${game.members}, купили ${game.bought} из ${game.members}, без подопечного ${game.noWard}`,
    );
  });
  lines.push(`Жеребьёвка по дате не прошла: ${live.drawFailed}`);
  const { byStatus, avgSize } = live.plans;
  lines.push(
    `Планы: лобби ${byStatus.lobby ?? 0}, колода ${byStatus.swiping ?? 0}, итоги ${byStatus.results ?? 0}, решено ${byStatus.decided ?? 0}; средний размер ${avgSize.toFixed(1)}`,
  );
  return lines.join("\n");
};
