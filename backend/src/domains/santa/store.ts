import type { SantaGame } from "@swipeit/core/api/santa/types";
import { notFound } from "@swipeit/core/errors";
import { repairAfterLeave } from "@swipeit/core/logic/draw";
import { and, asc, eq } from "drizzle-orm";

import type { Tx } from "../../context";
import { santaAssignments, santaGames, santaMembers } from "../../db/schema";

// Тайный Санта в базе (BACKEND.md B11): строка игры, участники и позванные —
// строки santa_members, пары — santa_assignments. Обработчики работают с тем
// же SantaGame, что и мок, но БЕЗ assignments: пары читает только wardIdOf
// (§4.6, п. 2), и в загруженную игру они не попадают никогда.

export type StoredGame = Omit<SantaGame, "assignments">;

const toDay = (value: string) => value.slice(0, 10);

export const loadGame = async (
  tx: Tx,
  id: string,
  { lock }: { lock: boolean },
): Promise<StoredGame> => {
  const query = tx
    .select()
    .from(santaGames)
    .where(eq(santaGames.id, id))
    .limit(1);
  const [row] = lock ? await query.for("update") : await query;
  if (!row) throw notFound("Игра не найдена");
  const members = await tx
    .select()
    .from(santaMembers)
    .where(eq(santaMembers.gameId, id))
    .orderBy(asc(santaMembers.seq));
  const joined = members.filter((member) => member.state === "joined");
  return {
    id: row.id,
    title: row.title,
    ownerId: row.ownerId,
    budget: row.budget,
    exchangeDate: toDay(row.exchangeDate),
    ...(row.drawAt ? { drawAt: row.drawAt.toISOString() } : {}),
    status: row.status as SantaGame["status"],
    participantIds: joined.map((member) => member.userId),
    invitedIds: members
      .filter((member) => member.state === "invited")
      .map((member) => member.userId),
    exclusions: row.exclusions as SantaGame["exclusions"],
    ...(row.drawnAt ? { drawnAt: row.drawnAt.toISOString() } : {}),
    openedIds: joined.filter((m) => m.openedAt).map((m) => m.userId),
    boughtIds: joined.filter((m) => m.boughtAt).map((m) => m.userId),
    removedIds: row.removedIds,
    createdAt: row.createdAt.toISOString(),
  };
};

const gameColumns = (game: StoredGame) => ({
  title: game.title,
  ownerId: game.ownerId,
  budget: game.budget,
  exchangeDate: game.exchangeDate,
  drawAt: game.drawAt ? new Date(game.drawAt) : null,
  status: game.status,
  exclusions: game.exclusions,
  drawnAt: game.drawnAt ? new Date(game.drawnAt) : null,
  removedIds: game.removedIds,
});

export const insertGame = async (tx: Tx, game: StoredGame, now: number) => {
  await tx.insert(santaGames).values({
    id: game.id,
    ...gameColumns(game),
    createdAt: new Date(game.createdAt),
  });
  const at = new Date(now);
  // По одной строке — seq растёт в порядке: организатор, позванные.
  for (const userId of game.participantIds) {
    await tx
      .insert(santaMembers)
      .values({ gameId: game.id, userId, state: "joined", joinedAt: at });
  }
  for (const userId of game.invitedIds) {
    await tx
      .insert(santaMembers)
      .values({ gameId: game.id, userId, state: "invited" });
  }
};

const memberWhere = (gameId: string, userId: string) =>
  and(eq(santaMembers.gameId, gameId), eq(santaMembers.userId, userId));

// Записать разницу между игрой до и после действия. Пары — отдельно
// (saveAssignments).
export const saveGame = async (
  tx: Tx,
  before: StoredGame,
  after: StoredGame,
  now: number,
) => {
  await tx
    .update(santaGames)
    .set(gameColumns(after))
    .where(eq(santaGames.id, after.id));
  const at = new Date(now);
  for (const userId of after.participantIds) {
    if (before.participantIds.includes(userId)) continue;
    // Позванный вступил — та же строка; пришёл по ссылке — новая.
    await tx
      .insert(santaMembers)
      .values({ gameId: after.id, userId, state: "joined", joinedAt: at })
      .onConflictDoUpdate({
        target: [santaMembers.gameId, santaMembers.userId],
        set: { state: "joined", joinedAt: at },
      });
  }
  for (const userId of after.invitedIds) {
    if (before.invitedIds.includes(userId)) continue;
    await tx
      .insert(santaMembers)
      .values({ gameId: after.id, userId, state: "invited" })
      .onConflictDoNothing();
  }
  // Позванный, который так и не вступил до жеребьёвки, выбывает; вышел
  // или убран (Q05) — тоже.
  for (const userId of [...before.invitedIds, ...before.participantIds]) {
    if (after.invitedIds.includes(userId)) continue;
    if (after.participantIds.includes(userId)) continue;
    await tx.delete(santaMembers).where(memberWhere(after.id, userId));
  }
  for (const userId of after.participantIds) {
    const opened = after.openedIds.includes(userId);
    const bought = after.boughtIds.includes(userId);
    const wasOpened = before.openedIds.includes(userId);
    const wasBought = before.boughtIds.includes(userId);
    if (opened === wasOpened && bought === wasBought) continue;
    await tx
      .update(santaMembers)
      .set({
        ...(opened === wasOpened ? {} : { openedAt: opened ? at : null }),
        ...(bought === wasBought ? {} : { boughtAt: bought ? at : null }),
      })
      .where(memberWhere(after.id, userId));
  }
};

export const saveAssignments = async (
  tx: Tx,
  gameId: string,
  assignments: Record<string, string>,
) => {
  const rows = Object.entries(assignments).map(([santaId, wardId]) => ({
    gameId,
    santaId,
    wardId,
  }));
  if (rows.length > 0) await tx.insert(santaAssignments).values(rows);
};

// Починка пар, когда участник удалил профиль после жеребьёвки (Q05). Читает
// все пары игры — это действие сервера, а не ответ кому-то: наружу уходит
// только, кому досталось новое письмо и кто остался без подопечного.
export const repairPairsAfterDelete = async (
  tx: Tx,
  gameId: string,
  userId: string,
): Promise<{ orphaned: null | string; rewired: null | string }> => {
  const rows = await tx
    .select()
    .from(santaAssignments)
    .where(eq(santaAssignments.gameId, gameId));
  const repair = repairAfterLeave(
    Object.fromEntries(rows.map((row) => [row.santaId, row.wardId])),
    userId,
  );
  await tx.delete(santaAssignments).where(eq(santaAssignments.gameId, gameId));
  const next = Object.entries(repair.assignments).map(([santaId, wardId]) => ({
    gameId,
    santaId,
    wardId,
  }));
  if (next.length > 0) await tx.insert(santaAssignments).values(next);
  // Новое письмо — снова запечатано, «подарок куплен» снят; без
  // подопечного — тоже без «куплен».
  for (const id of [repair.rewired, repair.orphaned]) {
    if (!id) continue;
    await tx
      .update(santaMembers)
      .set(
        id === repair.rewired
          ? { openedAt: null, boughtAt: null }
          : { boughtAt: null },
      )
      .where(memberWhere(gameId, id));
  }
  await tx.delete(santaMembers).where(memberWhere(gameId, userId));
  return { rewired: repair.rewired, orphaned: repair.orphaned };
};

// «Мой подопечный» — единственное место, где читаются пары (§4.6, п. 2):
// только своя строка, по santa_id того, кто спрашивает.
export const wardIdOf = async (
  tx: Tx,
  gameId: string,
  santaId: string,
): Promise<null | string> => {
  const [row] = await tx
    .select({ wardId: santaAssignments.wardId })
    .from(santaAssignments)
    .where(
      and(
        eq(santaAssignments.gameId, gameId),
        eq(santaAssignments.santaId, santaId),
      ),
    )
    .limit(1);
  return row?.wardId ?? null;
};
