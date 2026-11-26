import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import {
  DEFAULT_DEMO_SETTINGS,
  type DemoSettings,
} from "@/shared/api/demo/types";

type DemoSettingsState = {
  // «Режим демонстрации» из профиля: показывает кнопку демо-панели (T12).
  demoMode: boolean;
  setDemoMode: (enabled: boolean) => void;
  settings: DemoSettings;
  updateSettings: (patch: Partial<DemoSettings>) => DemoSettings;
};

// Настройки демо в режиме local (TECH_SPEC §9): скорость ботов, задержки,
// случайные ошибки, смещение часов. В lan их источник — сервер (T12b).
export const useDemoSettingsStore = create<DemoSettingsState>()(
  persist(
    (set, get) => ({
      demoMode: false,
      settings: DEFAULT_DEMO_SETTINGS,
      setDemoMode: (enabled) => set({ demoMode: enabled }),
      updateSettings: (patch) => {
        const settings = { ...get().settings, ...patch };
        set({ settings });
        return settings;
      },
    }),
    {
      name: "swipeit:demo-settings",
      storage: createJSONStorage(() => localStorage),
      // Новые поля настроек не должны теряться у тех, у кого стор уже сохранён.
      merge: (persisted, current) => {
        const saved = persisted as Partial<DemoSettingsState> | undefined;
        return {
          ...current,
          ...saved,
          settings: { ...current.settings, ...saved?.settings },
        };
      },
    },
  ),
);
