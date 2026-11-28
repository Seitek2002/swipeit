import { eq } from "drizzle-orm";

import type { ServerContext } from "../../context";
import { santaGames } from "../../db/schema";
import { notifySantaNewLetter } from "../notifications/events";
import { repairPairsAfterDelete } from "./store";

// Человек ушёл из игры после жеребьёвки — удалил профиль (Q05) или его убрал
// организатор (auto-tasks-pm-3 R05). Пары чинятся одним правилом
// (repairAfterLeave из core): Санта ушедшего дарит его подопечному. Новое
// письмо — тостом только тому, кому оно досталось; остальным — обычное
// «перечитай» без пар.
export const repairAfterRemoval = async (
  ctx: ServerContext,
  gameId: string,
  userId: string,
) => {
  const { rewired, orphaned } = await repairPairsAfterDelete(
    ctx.tx,
    gameId,
    userId,
  );
  if (rewired) {
    ctx.events.publish(
      {
        type: "toast",
        text: "Твой подопечный вышел из игры — открой новое письмо",
        forUserId: rewired,
      },
      [rewired],
    );
    // И ботом (S10): тост увидит, только если приложение открыто.
    const [game] = await ctx.tx
      .select({ id: santaGames.id, title: santaGames.title })
      .from(santaGames)
      .where(eq(santaGames.id, gameId))
      .limit(1);
    if (game) {
      await notifySantaNewLetter(ctx.tx, game, rewired, ctx.clock.now());
    }
  }
  if (orphaned) {
    ctx.events.publish(
      {
        type: "toast",
        text: "Твой подопечный вышел из игры — в этой игре ты не даришь",
        forUserId: orphaned,
      },
      [orphaned],
    );
  }
};
