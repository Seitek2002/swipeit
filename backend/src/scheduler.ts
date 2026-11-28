import type { Random } from "@swipeit/core/logic/random";
import type { FastifyBaseLogger } from "fastify";
import { inArray } from "drizzle-orm";

import type { ServerCatalog } from "./catalog/load";
import type { Clock, ServerContext } from "./context";
import type { Db } from "./db/client";
import { planParticipants } from "./db/schema";
import { expireDuePlans } from "./domains/plans/handlers";
import { drawDueSantaGames } from "./domains/santa/handlers";
import type { AddressedEvent, EventHub } from "./realtime/hub";

// Планировщик сервера (BACKEND.md B13): дедлайны «До даты» и жеребьёвка по
// дате срабатывают без телефонов. Один проход — одна транзакция; события
// уходят после commit, как у запросов.
export type SchedulerDeps = {
  catalog: ServerCatalog;
  clock: Clock;
  db: Db;
  hub: EventHub;
  log: FastifyBaseLogger;
  random: Random;
};

export const runSchedulerOnce = async (deps: SchedulerDeps) => {
  const events: AddressedEvent[] = [];
  const result = await deps.db.db.transaction(async (tx) => {
    const ctx: ServerContext = {
      tx,
      userId: null,
      sessionId: null,
      userAgent: null,
      isRefetch: false,
      clock: deps.clock,
      random: deps.random,
      catalog: deps.catalog,
      events: { publish: (event, to) => events.push({ event, to }) },
      log: deps.log,
      publicShareUrl: "",
    };
    const expired = await expireDuePlans(tx, deps.clock.now());
    // Участникам закрытых планов — «перечитай».
    if (expired.length > 0) {
      const members = await tx
        .select({
          planId: planParticipants.planId,
          userId: planParticipants.userId,
        })
        .from(planParticipants)
        .where(inArray(planParticipants.planId, expired));
      for (const planId of expired) {
        ctx.events.publish(
          { type: "db:changed", scope: ["plans"], id: planId },
          members.filter((m) => m.planId === planId).map((m) => m.userId),
        );
      }
    }
    const santa = await drawDueSantaGames(ctx);
    return { expired, ...santa };
  });
  deps.hub.deliver(events);
  if (result.failed.length > 0) {
    deps.log.warn({ failed: result.failed }, "Жеребьёвка по дате не прошла");
  }
  return result;
};

const INTERVAL_MS = 15_000;

// Раз в 15 секунд. Ошибка прохода — в лог, следующий проход — по расписанию.
export const startScheduler = (
  deps: SchedulerDeps,
  intervalMs = INTERVAL_MS,
) => {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await runSchedulerOnce(deps);
    } catch (error) {
      deps.log.error({ err: error }, "Планировщик: проход не удался");
    } finally {
      running = false;
    }
  };
  const timer = setInterval(() => void tick(), intervalMs);
  timer.unref();
  return () => clearInterval(timer);
};
