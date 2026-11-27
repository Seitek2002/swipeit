import { clock } from "@/shared/lib/clock";
import { getRealtime } from "@/shared/lib/realtime";
import { useDemoSettingsStore } from "@/shared/store";

import { DB_STORAGE_KEY } from "../../db";
import { createCryptoRandom } from "../../random";
import { buildSeedDb } from "../../seed";
import { type MockServer, createMockServer } from "../../server";
import { createFetchCatalog } from "./fetch-catalog";
import { createLocalStorageDb } from "./local-db";

// Мок-сервер режима local: те же обработчики, что и на LAN-сервере, поверх
// браузерных адаптеров. Создаётся один раз на вкладку.
let server: MockServer | null = null;

export const getBrowserMockServer = (): MockServer => {
  if (server) return server;
  const realtime = getRealtime();
  const catalog = createFetchCatalog();
  server = createMockServer({
    catalog,
    clock,
    realtime,
    random: createCryptoRandom(),
    db: createLocalStorageDb({
      key: DB_STORAGE_KEY,
      createInitial: () => buildSeedDb({ catalog, clock }),
      onReset: () =>
        realtime.publish({ type: "toast", text: "Демо-данные сброшены" }),
    }),
    settings: {
      get: () => useDemoSettingsStore.getState().settings,
      update: (patch) => useDemoSettingsStore.getState().updateSettings(patch),
    },
  });
  // Настройки демо живут в localStorage, а стор каждой вкладки читает их
  // один раз. Поменяли в другой вкладке (скорость ботов, перемотка часов) —
  // перечитываем, иначе вкладка-лидер гоняла бы ботов по старым настройкам.
  realtime.subscribe((event) => {
    if (event.type === "db:changed" && event.scope.includes("settings")) {
      void useDemoSettingsStore.persist.rehydrate();
    }
  });
  return server;
};
