import { mkdirSync, readFileSync } from "node:fs";
import path from "node:path";

import { DEFAULT_DEMO_SETTINGS } from "@/shared/api/demo/constants";
import { type DemoSettings, DemoSettingsSchema } from "@/shared/api/demo/types";
import type { SettingsAccess } from "@/shared/api/mock-server/context";

import { writeFileAtomic } from "./atomic-file";

export type FileSettings = SettingsAccess & { flush(): Promise<void> };

const loadSettings = (file: string): DemoSettings => {
  try {
    const raw = JSON.parse(readFileSync(file, "utf8")) as unknown;
    const parsed = DemoSettingsSchema.partial().safeParse(raw);
    // Битые или старые настройки — не повод не стартовать: берём умолчания.
    return parsed.success
      ? { ...DEFAULT_DEMO_SETTINGS, ...parsed.data }
      : DEFAULT_DEMO_SETTINGS;
  } catch {
    return DEFAULT_DEMO_SETTINGS;
  }
};

// Настройки демо в lan общие для всех телефонов (TECH_SPEC §6–7): скорость
// ботов, перемотка часов. Живут в памяти (обработчики читают их синхронно)
// и сохраняются в .lan-data/settings.json, чтобы пережить перезапуск.
export const createFileSettings = (file: string): FileSettings => {
  let settings = loadSettings(file);
  let queue: Promise<unknown> = Promise.resolve();

  const save = (snapshot: DemoSettings) => {
    queue = queue
      .then(async () => {
        mkdirSync(path.dirname(file), { recursive: true });
        await writeFileAtomic(file, JSON.stringify(snapshot, null, 2));
      })
      .catch((error: unknown) =>
        console.error("Не удалось сохранить настройки демо:", error),
      );
  };

  return {
    get: () => settings,
    update: (patch) => {
      settings = { ...settings, ...patch };
      save(settings);
      return settings;
    },
    flush: async () => {
      await queue;
    },
  };
};
