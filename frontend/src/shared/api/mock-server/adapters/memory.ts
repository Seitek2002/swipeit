import type { RealtimeEvent } from "@/shared/lib/realtime/types";

import type { Activity, CatalogMeta, Product } from "../../catalog/types";
import { DEFAULT_DEMO_SETTINGS, type DemoSettings } from "../../demo/types";
import type {
  CatalogAccess,
  Clock,
  DbAccess,
  RealtimePublisher,
  SettingsAccess,
} from "../context";
import { type Db, assertValidDb } from "../db";

// Адаптеры «в памяти»: без браузера и без файлов. Ими пользуются тесты
// (Vitest в окружении node) — это и есть проверка изоморфности обработчиков.

export const createMemoryDb = (
  createInitial: () => Promise<Db>,
): DbAccess & {
  snapshot(): Db | null;
} => {
  let current: Db | null = null;
  // Записи строго по очереди — как в LAN-адаптере.
  let queue: Promise<unknown> = Promise.resolve();

  const load = async () => {
    current ??= await createInitial();
    return current;
  };

  return {
    snapshot: () => current,
    read: async () => structuredClone(await load()),
    // Сброс — в той же очереди, что и записи: иначе запись, начатая до сброса,
    // вернула бы старую базу.
    replace: (next) => {
      const run = queue.then(() => {
        current = assertValidDb(structuredClone(next));
      });
      queue = run.catch(() => undefined);
      return run;
    },
    write: <T>(mutator: (db: Db) => T) => {
      const run = queue.then(async () => {
        const draft = structuredClone(await load());
        const result = mutator(draft);
        current = assertValidDb(draft);
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  };
};

// Тестам, которым авторы фото не важны, хватает пустого meta.json.
export const EMPTY_CATALOG_META: CatalogMeta = {
  collectedAt: "",
  rates: { source: "", date: "", RUB: 0, USD: 0, CNY: 0 },
  activityPhotoCredits: [],
};

export const createMemoryCatalog = (
  products: Product[],
  activities: Activity[] = [],
  meta: CatalogMeta = EMPTY_CATALOG_META,
): CatalogAccess => ({
  products: async () => products,
  activities: async () => activities,
  meta: async () => meta,
});

export const createMemorySettings = (
  initial: DemoSettings = DEFAULT_DEMO_SETTINGS,
): SettingsAccess => {
  let settings = { ...initial };
  return {
    get: () => settings,
    update: (patch) => {
      settings = { ...settings, ...patch };
      return settings;
    },
  };
};

export const createRecordingRealtime = (): RealtimePublisher & {
  events: RealtimeEvent[];
} => {
  const events: RealtimeEvent[] = [];
  return { events, publish: (event) => events.push(event) };
};

export const createFixedClock = (
  start: number,
): Clock & { advance(ms: number): void } => {
  let now = start;
  return {
    now: () => now,
    advance: (ms) => {
      now += ms;
    },
  };
};
