import { ALL_SCOPES } from "@/shared/lib/realtime/types";

import { DemoSettingsSchema } from "../../demo/types";
import type { Handler } from "../context";
import { DEMO_USER_ID, buildSeedDb } from "../seed";
import { parseInput } from "./common";

// POST /demo/reset — база заново из сида. Все вкладки (и телефоны в lan)
// получают событие и перечитывают всё.
export const resetDemo: Handler = async (ctx) => {
  const seed = await buildSeedDb(ctx);
  // Сбрасывает демо-пользователь «Айгерим» — она остаётся человеком, иначе
  // боты (T12) начали бы действовать от её имени.
  const demoUser = seed.users[DEMO_USER_ID];
  if (ctx.userId === DEMO_USER_ID && demoUser) demoUser.isBot = false;
  await ctx.db.replace(seed);
  ctx.realtime.publish({
    type: "db:changed",
    scope: ALL_SCOPES,
    by: ctx.userId ?? "system",
  });
  return { ok: true };
};

// GET /demo/users — все профили базы для «Смотреть как» в демо-панели:
// сначала люди, потом боты. Расширение контракта TECH_SPEC §6 (только демо).
export const listDemoUsers: Handler = async (ctx) => {
  const db = await ctx.db.read();
  return Object.values(db.users).sort((a, b) =>
    a.isBot === b.isBot ? a.name.localeCompare(b.name, "ru") : a.isBot ? 1 : -1,
  );
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
