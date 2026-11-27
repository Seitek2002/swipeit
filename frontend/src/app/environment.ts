import {
  ApiError,
  type ApiMode,
  apiUrl,
  detectEnvironment,
  getDemoSettings,
  httpTransport,
  setTransport,
  warmLocalApi,
} from "@/shared/api";
import { setLanClock } from "@/shared/lib/clock";
import { setRemoteImageStore, setShareOrigin } from "@/shared/lib/dom";
import {
  createWsRealtime,
  getConnectionStatus,
  setRealtime,
  subscribeConnection,
} from "@/shared/lib/realtime";
import {
  getActiveUserId,
  setLastUserKey,
  useSessionStore,
} from "@/shared/store";

// Сразу при загрузке модуля, до гидрации и до проверки режима: мок-сервер и
// каталог качаются параллельно с ней (shared/api/warmup.ts).
warmLocalApi();

// Адрес WebSocket того же сервера, что отвечает на /api.
const wsUrl = () => {
  const http = apiUrl("/health").replace(/\/api\/health$/, "/ws");
  if (/^https?:/.test(http)) return http.replace(/^http/, "ws");
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}${http}`;
};

type Health = { now: number; serverId: string };

const fetchHealth = () =>
  fetch(apiUrl("/health"), { cache: "no-store" }).then(
    (response) => response.json() as Promise<Health>,
  );

// Часы lan: разница с ноутбуком без перемотки + общая перемотка. Заодно
// отдаёт serverId — по нему видно, что ноутбук запустили с новой базой.
const syncLanClock = async (): Promise<Health> => {
  const [health, settings] = await Promise.all([
    fetchHealth(),
    getDemoSettings(),
  ]);
  setLanClock({
    diffMs: health.now - settings.clockOffsetMs - Date.now(),
    offsetMs: settings.clockOffsetMs,
  });
  return health;
};

// Ошибка загрузки фото — с текстом сервера («Фото больше 5 МБ»).
const uploadImage = async (blob: Blob) => {
  let response: Response;
  try {
    response = await fetch(apiUrl("/uploads"), {
      method: "POST",
      headers: { "content-type": blob.type || "image/jpeg" },
      body: blob,
    });
  } catch {
    throw new ApiError(0, "OFFLINE", "Нет связи с ноутбуком");
  }
  const data = (await response.json().catch(() => null)) as {
    code?: string;
    key?: string;
    message?: string;
  } | null;
  if (!response.ok || !data?.key) {
    throw new ApiError(
      response.status,
      "VALIDATION",
      data?.message ?? "Не получилось загрузить фото",
    );
  }
  return data.key;
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
      setShareOrigin(environment.lan.shareOrigin ?? null);
      // До первой сверки часы — по ответу /health без перемотки: иначе
      // подхватилось бы смещение из local-режима этого браузера.
      setLanClock({ diffMs: environment.lan.now - Date.now(), offsetMs: 0 });
      setRemoteImageStore({
        upload: uploadImage,
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
      // Ноутбук мог перезапуститься, пока вкладка ждала: сверяем часы, а если
      // база новая (другой serverId, например после --reset) — начинаем
      // вкладку заново, иначе профиль записался бы под ключ старого сервера.
      const serverId = environment.lan.serverId;
      subscribeConnection(() => {
        if (getConnectionStatus() !== "online") return;
        void syncLanClock()
          .then((health) => {
            if (health.serverId !== serverId) window.location.reload();
          })
          .catch(() => undefined);
      });
    } else {
      await useSessionStore.persist.rehydrate();
    }
    return environment.mode;
  })();
  // Не получилось — следующая попытка начнёт заново, а не вернёт ту же ошибку.
  started.catch(() => {
    started = null;
  });
  return started;
};
