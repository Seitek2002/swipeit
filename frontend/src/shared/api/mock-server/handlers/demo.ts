import { ALL_SCOPES } from "@/shared/lib/realtime/types";

import { DEFAULT_DEMO_SETTINGS } from "../../demo/constants";
import { DemoSettingsSchema } from "../../demo/types";
import type { Handler, HandlerContext } from "../context";
import { applyNewYearScenario } from "../scenarios/new-year";
import { DEMO_USER_ID, buildSeedDb, createSeedDb } from "../seed";
import { parseInput } from "./common";
import { isNamelessHuman, publicUser } from "./users";

// «Сбросить всё» — и часы, и скорость ботов, и ошибки API: иначе следующая
// группа начала бы с перемотанным временем (в lan настройки общие). До
// сборки сида — дни рождения «через N дней» считаются уже от настоящих
// часов, без перемотки.
const resetSettings = (ctx: HandlerContext) =>
  ctx.settings.update(DEFAULT_DEMO_SETTINGS);

// Все вкладки (и телефоны в lan) перечитывают всё. В scope есть settings —
// движок ботов по нему продолжает начатое (resume): так боты подхватывают
// и план из сценария.
const publishAllChanged = (ctx: HandlerContext, by: string) =>
  ctx.realtime.publish({ type: "db:changed", scope: ALL_SCOPES, by });

// POST /demo/reset — база заново из сида.
export const resetDemo: Handler = async (ctx) => {
  resetSettings(ctx);
  const seed = await buildSeedDb(ctx);
  // Сбрасывает демо-пользователь «Айгерим» — она остаётся человеком, иначе
  // боты (T12) начали бы действовать от её имени.
  const demoUser = seed.users[DEMO_USER_ID];
  if (ctx.userId === DEMO_USER_ID && demoUser) demoUser.isBot = false;
  await ctx.db.replace(seed);
  publishAllChanged(ctx, ctx.userId ?? "system");
  return { ok: true };
};

// POST /demo/scenario/new-year — сценарий «Новый год» (TASKS T19, TECH_SPEC
// §6): как сброс, только поверх сида — вишлист Айгерим к Новому году, план
// «Новогодние каникулы» и Тайный Санта «Офис, Новый год». Всё — от имени
// Айгерим, кто бы ни нажал (и без сессии — новое устройство): клиент
// после ответа сам входит как Айгерим. Повторный вызов — снова свежий
// сценарий.
export const loadNewYearScenario: Handler = async (ctx) => {
  resetSettings(ctx);
  const [products, activities] = await Promise.all([
    ctx.catalog.products(),
    ctx.catalog.activities(),
  ]);
  const now = ctx.clock.now();
  const db = createSeedDb({ products, now });
  const ids = applyNewYearScenario(db, { activities, now, products });
  await ctx.db.replace(db);
  publishAllChanged(ctx, DEMO_USER_ID);
  return { ok: true, ...ids };
};

// GET /demo/users — все профили базы для «Смотреть как» в демо-панели:
// сначала люди, потом боты. Расширение контракта TECH_SPEC §6 (только демо).
export const listDemoUsers: Handler = async (ctx) => {
  const db = await ctx.db.read();
  // В lan чужие профили без имени не показываем: плашка сети считает по
  // этому списку «Здесь уже 3 человека», а безымянного никто не узнает
  // (TECH_SPEC §7a). Свой профиль — всегда (для «Смотреть как»).
  return Object.values(db.users)
    .map((user) => (user.id === ctx.userId ? user : publicUser(user)))
    .filter(
      (user) =>
        ctx.mode !== "lan" || user.id === ctx.userId || !isNamelessHuman(user),
    )
    .sort((a, b) =>
      a.isBot === b.isBot
        ? (a.name ?? "").localeCompare(b.name ?? "", "ru")
        : a.isBot
          ? 1
          : -1,
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
