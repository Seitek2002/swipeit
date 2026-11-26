import { ALL_SCOPES } from "@/shared/lib/realtime/types";

import { DemoSettingsSchema } from "../../demo/types";
import type { Handler } from "../context";
import { buildSeedDb } from "../seed";
import { parseInput } from "./common";

// POST /demo/reset — база заново из сида. Все вкладки (и телефоны в lan)
// получают событие и перечитывают всё.
export const resetDemo: Handler = async (ctx) => {
  await ctx.db.replace(await buildSeedDb(ctx));
  ctx.realtime.publish({
    type: "db:changed",
    scope: ALL_SCOPES,
    by: ctx.userId ?? "system",
  });
  return { ok: true };
};

export const getSettings: Handler = async (ctx) => ctx.settings.get();

export const updateSettings: Handler = async (ctx, { body }) => {
  const patch = parseInput(DemoSettingsSchema.partial(), body);
  const next = ctx.settings.update(patch);
  ctx.realtime.publish({
    type: "db:changed",
    scope: ["settings"],
    by: ctx.userId ?? "system",
  });
  return next;
};
