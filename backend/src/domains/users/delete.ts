import { AVATAR_COLORS } from "@swipeit/core/config";
import { eq, or, sql } from "drizzle-orm";

import type { ServerContext, ServerHandler, Tx } from "../../context";
import {
  customActivities,
  friendships,
  identities,
  importantDates,
  pickAnswers,
  pickRequests,
  planSwipes,
  planVotes,
  productSwipes,
  reservations,
  sessions,
  shareLinks,
  uploads,
  users,
  wishlistItems,
  wishlistMeta,
} from "../../db/schema";
import { repairPairsAfterDelete } from "../santa/store";
import { lockMe } from "./queries";

// DELETE /me (BACKEND.md §3.4): удалить человека и его данные — желания,
// свайпы, даты, сессии, привязки, фото, ссылки, брони, дружбы.
//
// В закончившихся чужих планах он остаётся строкой «Удалённый профиль» без
// имени. Его свайпы и голоса в планах удаляются; из игр Санты он уходит
// совсем — после жеребьёвки пары чинятся. Свой план или своя игра, где больше никого нет, —
// удаляются целиком; где есть другие — остаются им. Организатор — тот, кто
// вступил раньше всех (Q04 для планов, Q05 для Санты). В игре после
// жеребьёвки пары чинятся (Q05): Санта ушедшего дарит его подопечному.
//
// Профиль, на который больше ничего не ссылается, удаляется физически;
// иначе остаётся строка users без личного (deleted_at). Строки базы — без
// внешних ключей с каскадом на участников, поэтому всё это делает код.

// Свои планы и игры, где нет никого, кроме владельца.
const deleteLonelyOwned = async (tx: Tx, id: string) => {
  await tx.execute(sql`
    delete from plans p where p.owner_id = ${id} and not exists (
      select 1 from plan_participants pp
      where pp.plan_id = p.id and pp.user_id <> ${id}
    )
  `);
  await tx.execute(sql`
    delete from santa_games g where g.owner_id = ${id} and not exists (
      select 1 from santa_members m
      where m.game_id = g.id and m.user_id <> ${id}
    )
  `);
};

// Чужой план, который ещё идёт, и чужая игра до жеребьёвки: участника
// больше нет — его строку убираем, иначе план ждал бы его «Готов» и «Всё», а
// жеребьёвка выдала бы кому-то пустого подопечного. Строка «Удалённый
// профиль» остаётся там, где всё уже случилось: итоги плана, пары Санты.
const leaveActive = async (tx: Tx, id: string) => {
  await tx.execute(sql`
    delete from plan_participants pp using plans p
    where pp.plan_id = p.id and pp.user_id = ${id} and p.owner_id <> ${id}
      and p.status in ('lobby', 'swiping')
  `);
  await tx.execute(sql`
    delete from santa_members m using santa_games g
    where m.game_id = g.id and m.user_id = ${id} and g.owner_id <> ${id}
      and g.status = 'gathering'
  `);
};

// Свои планы, где остались другие (Q04): организатором становится тот, кто
// вступил раньше всех, — иначе план нельзя ни запустить, ни закрыть, ни
// решить. В лобби организатор «готов» всегда. Новому организатору — тост.
const handOverPlans = async (ctx: ServerContext, id: string) => {
  const { rows } = await ctx.tx.execute<{
    id: string;
    owner_id: string;
    title: string;
  }>(sql`
    update plans p set owner_id = (
      select pp.user_id from plan_participants pp
      where pp.plan_id = p.id and pp.user_id <> ${id}
      order by pp.seq limit 1
    )
    where p.owner_id = ${id}
    returning p.id, p.owner_id, p.title
  `);
  for (const plan of rows) {
    await ctx.tx.execute(sql`
      update plan_participants set ready = true
      where plan_id = ${plan.id} and user_id = ${plan.owner_id}
    `);
    ctx.events.publish({
      type: "toast",
      text: `Теперь ты организатор плана «${plan.title}»`,
      forUserId: plan.owner_id,
    });
  }
};

// Свои игры Санты, где остались другие (Q05): организатором — тот, кто
// вступил раньше всех, до и после жеребьёвки. Ему — тост.
const handOverGames = async (ctx: ServerContext, id: string) => {
  const { rows } = await ctx.tx.execute<{
    id: string;
    owner_id: string;
    title: string;
  }>(sql`
    update santa_games g set owner_id = (
      select m.user_id from santa_members m
      where m.game_id = g.id and m.user_id <> ${id} and m.state = 'joined'
      order by m.seq limit 1
    )
    where g.owner_id = ${id} and exists (
      select 1 from santa_members m
      where m.game_id = g.id and m.user_id <> ${id} and m.state = 'joined'
    )
    returning g.id, g.owner_id, g.title
  `);
  for (const game of rows) {
    ctx.events.publish({
      type: "toast",
      text: `Теперь ты организатор игры «${game.title}»`,
      forUserId: game.owner_id,
    });
  }
};

// Игры после жеребьёвки, где человек был (Q05): пары чинятся, его строка
// уходит. Новое письмо — тостом только тому, кому оно досталось; остальным
// — обычное «перечитай» без пар.
const repairDrawnGames = async (ctx: ServerContext, id: string) => {
  const { rows } = await ctx.tx.execute<{ game_id: string }>(sql`
    select m.game_id from santa_members m
    join santa_games g on g.id = m.game_id
    where m.user_id = ${id} and g.status = 'drawn'
  `);
  for (const { game_id: gameId } of rows) {
    const { rewired, orphaned } = await repairPairsAfterDelete(
      ctx.tx,
      gameId,
      id,
    );
    if (rewired) {
      ctx.events.publish({
        type: "toast",
        text: "Твой подопечный вышел из игры — открой новое письмо",
        forUserId: rewired,
      });
    }
    if (orphaned) {
      ctx.events.publish({
        type: "toast",
        text: "Твой подопечный вышел из игры — в этой игре ты не даришь",
        forUserId: orphaned,
      });
    }
  }
};

// Идущие планы, из которых человек ушёл: остальные уже долистали — к
// итогам, ждать больше некого (как completeIfAllFinished).
const completeLeftPlans = async (tx: Tx, planIds: readonly string[]) => {
  for (const planId of planIds) {
    await tx.execute(sql`
      update plans p set status = 'results'
      where p.id = ${planId} and p.status = 'swiping' and not exists (
        select 1 from plan_participants pp
        where pp.plan_id = p.id and not pp.finished
      )
    `);
  }
};

// Свои занятия, которых нет ни в одном оставшемся плане. Занятия в чужих
// планах остаются (без них колода плана сломается), но без фото.
const deleteOwnActivities = async (tx: Tx, id: string) => {
  await tx.execute(sql`
    delete from custom_activities a where a.created_by = ${id} and not exists (
      select 1 from plans p where a.id = any(p.custom_activity_ids)
    )
  `);
  const kept = await tx
    .select({ id: customActivities.id, activity: customActivities.activity })
    .from(customActivities)
    .where(eq(customActivities.createdBy, id));
  for (const row of kept) {
    const activity = { ...(row.activity as Record<string, unknown>) };
    delete activity.imageKey;
    delete activity.image;
    await tx
      .update(customActivities)
      .set({ activity, imageKey: null })
      .where(eq(customActivities.id, row.id));
  }
};

// Осталось ли что-то, что ссылается на профиль (чужие планы и игры).
const isStillReferenced = async (tx: Tx, id: string) => {
  const { rows } = await tx.execute<{ found: boolean }>(sql`
    select
      exists (select 1 from plans where owner_id = ${id})
      or exists (select 1 from plan_participants where user_id = ${id})
      or exists (select 1 from santa_games where owner_id = ${id})
      or exists (select 1 from santa_members where user_id = ${id})
      or exists (
        select 1 from santa_assignments
        where santa_id = ${id} or ward_id = ${id}
      )
      or exists (select 1 from custom_activities where created_by = ${id})
      as found
  `);
  return Boolean(rows[0]?.found);
};

export const deleteMe: ServerHandler = async (ctx) => {
  const me = await lockMe(ctx);
  const { tx } = ctx;
  const id = me.id;

  await deleteLonelyOwned(tx, id);
  await handOverPlans(ctx, id);
  await handOverGames(ctx, id);
  await repairDrawnGames(ctx, id);
  const activePlans = await tx.execute<{ plan_id: string }>(sql`
    select pp.plan_id from plan_participants pp
    join plans p on p.id = pp.plan_id
    where pp.user_id = ${id} and p.status in ('lobby', 'swiping')
  `);
  await leaveActive(tx, id);
  await completeLeftPlans(
    tx,
    activePlans.rows.map((row) => row.plan_id),
  );
  await tx.delete(planSwipes).where(eq(planSwipes.userId, id));
  await tx.delete(planVotes).where(eq(planVotes.userId, id));
  await deleteOwnActivities(tx, id);

  // Своё — целиком. Брони: и его брони у других, и брони на его вишлист.
  await tx
    .delete(reservations)
    .where(or(eq(reservations.reserverId, id), eq(reservations.ownerRef, id)));
  await tx.delete(shareLinks).where(eq(shareLinks.ownerId, id));
  await tx.delete(pickAnswers).where(eq(pickAnswers.byUserId, id));
  await tx.delete(pickRequests).where(eq(pickRequests.fromUserId, id));
  await tx.delete(productSwipes).where(eq(productSwipes.userId, id));
  await tx.delete(wishlistItems).where(eq(wishlistItems.ownerId, id));
  await tx.delete(wishlistMeta).where(eq(wishlistMeta.ownerId, id));
  await tx.delete(importantDates).where(eq(importantDates.ownerId, id));
  await tx
    .delete(friendships)
    .where(or(eq(friendships.userId, id), eq(friendships.friendId, id)));
  await tx.delete(uploads).where(eq(uploads.ownerId, id));
  await tx.delete(identities).where(eq(identities.userId, id));
  await tx.delete(sessions).where(eq(sessions.userId, id));

  if (await isStillReferenced(tx, id)) {
    await tx
      .update(users)
      .set({
        name: null,
        // Фон — первый из списка, чтобы и он ничего не говорил о человеке.
        avatarColor: AVATAR_COLORS[0],
        birthday: null,
        interests: [],
        mutedInterests: [],
        audience: "all",
        taste: null,
        seenHints: [],
        dismissedReminders: [],
        deletedAt: new Date(ctx.clock.now()),
      })
      .where(eq(users.id, id));
  } else {
    await tx.delete(users).where(eq(users.id, id));
  }

  // Друзьям и соучастникам — перечитать (B12 разошлёт адресатам).
  ctx.events.publish({
    type: "db:changed",
    scope: ["users", "plans", "santa"],
  });
  return { ok: true };
};
