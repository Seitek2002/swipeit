import type { RealtimeEvent } from "@/shared/lib/realtime/types";

import type { Activity, CatalogMeta, Product } from "../catalog/types";
import type { DemoSettings } from "../demo/types";
import type { Db } from "./db";
import type { Random } from "./random";

// Всё, что обработчикам нужно от «окружения», приходит снаружи (TECH_SPEC §6
// «Изоморфность»). В браузере это localStorage + BroadcastChannel, на
// LAN-сервере — JSON-файл + WebSocket. Сами обработчики про это не знают.

export type DbAccess = {
  // Прочитать базу (если её нет или она битая — адаптер создаёт её из сида).
  read(): Promise<Db>;
  // Заменить базу целиком (сброс демо).
  replace(next: Db): Promise<void>;
  // Прочитать → изменить → проверить → записать. Адаптер отвечает за то,
  // чтобы две вкладки (или два запроса) не затёрли друг друга.
  write<T>(mutator: (db: Db) => T): Promise<T>;
};

export type RealtimePublisher = { publish(event: RealtimeEvent): void };

export type Clock = { now(): number };

export type CatalogAccess = {
  activities(): Promise<Activity[]>;
  // meta.json: курсы и авторы фото занятий (страница «Авторы фото»).
  meta(): Promise<CatalogMeta>;
  products(): Promise<Product[]>;
};

export type SettingsAccess = {
  get(): DemoSettings;
  update(patch: Partial<DemoSettings>): DemoSettings;
};

export type ServerDeps = {
  catalog: CatalogAccess;
  clock: Clock;
  db: DbAccess;
  // Где работает сервер: local — во вкладке, lan — на ноутбуке (TECH_SPEC
  // §7a). Влияет на правила, а не на устройство: в lan все люди сервера —
  // друзья друг другу. По умолчанию local.
  mode?: "lan" | "local";
  random: Random;
  realtime: RealtimePublisher;
  settings: SettingsAccess;
};

export type HandlerContext = ServerDeps & {
  // Пользователь запроса: сессия вкладки (local) или заголовок x-user-id (lan).
  userId: null | string;
};

export type HandlerInput = {
  body: unknown;
  params: Record<string, string>;
  query: Record<string, unknown>;
};

export type Handler = (
  ctx: HandlerContext,
  input: HandlerInput,
) => Promise<unknown>;

export const nowIso = (clock: Clock) => new Date(clock.now()).toISOString();
