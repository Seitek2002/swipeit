import {
  type ApiMode,
  apiUrl,
  detectEnvironment,
  getDemoSettings,
  httpTransport,
  setTransport,
} from "@/shared/api";
import { setLanClock } from "@/shared/lib/clock";
import { setRemoteImageStore } from "@/shared/lib/dom";
import { createWsRealtime, setRealtime } from "@/shared/lib/realtime";
import {
  getActiveUserId,
  setLastUserKey,
  useSessionStore,
} from "@/shared/store";

// Адрес WebSocket того же сервера, что отвечает на /api.
const wsUrl = () => {
  const http = apiUrl("/health").replace(/\/api\/health$/, "/ws");
  if (/^https?:/.test(http)) return http.replace(/^http/, "ws");
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${http}`;
};

// Часы lan: разница с ноутбуком без перемотки + общая перемотка.
const syncLanClock = async () => {
  const [health, settings] = await Promise.all([
    fetch(apiUrl("/health"), { cache: "no-store" }).then(
      (response) => response.json() as Promise<{ now: number }>,
    ),
    getDemoSettings(),
  ]);
  setLanClock({
    diffMs: health.now - settings.clockOffsetMs - Date.now(),
    offsetMs: settings.clockOffsetMs,
  });
};

// Запуск вкладки (TECH_SPEC §6): режим → транспорт, шина, часы, сессия.
// До конца — заставка с бантом (не дольше ~800 ms на определение режима).
let started: null | Promise<ApiMode> = null;

export const startEnvironment = (): Promise<ApiMode> => {
  started ??= (async () => {
    const environment = await detectEnvironment();
    if (environment.mode === "lan" && environment.lan) {
      setLastUserKey(`swipeit:lan:${environment.lan.serverId}:userId`);
      setTransport(httpTransport);
      setRemoteImageStore({
        upload: async (blob) => {
          const response = await fetch(apiUrl("/uploads"), {
            method: "POST",
            headers: { "content-type": blob.type || "image/jpeg" },
            body: blob,
          });
          if (!response.ok) throw new Error("upload failed");
          return ((await response.json()) as { key: string }).key;
        },
        urlOf: (key) => apiUrl(`/uploads/${encodeURIComponent(key)}`),
      });
      const realtime = createWsRealtime(wsUrl());
      setRealtime(realtime);
      await useSessionStore.persist.rehydrate();
      realtime.setUserId(getActiveUserId());
      useSessionStore.subscribe((state, previous) => {
        if (state.activeUserId !== previous.activeUserId) {
          realtime.setUserId(state.activeUserId);
        }
      });
      // Перемотка общая: пришло событие настроек — подстраиваем часы.
      realtime.subscribe((event) => {
        if (event.type === "db:changed" && event.scope.includes("settings")) {
          void syncLanClock().catch(() => undefined);
        }
      });
      await syncLanClock().catch(() => undefined);
    } else {
      await useSessionStore.persist.rehydrate();
    }
    return environment.mode;
  })();
  return started;
};
