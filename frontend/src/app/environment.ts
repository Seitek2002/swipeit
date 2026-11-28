import {
  ApiError,
  type ApiMode,
  CLIENT_BUILD,
  type RemoteInfo,
  apiUrl,
  detectEnvironment,
  getDemoSettings,
  getMe,
  httpTransport,
  isClientOutdated,
  isRemoteBuild,
  remoteApiUrl,
  remoteImageUrl,
  remoteTransport,
  remoteWsUrl,
  setTransport,
  uploadRemoteImage,
  warmLocalApi,
} from "@/shared/api";
import { setLanClock } from "@/shared/lib/clock";
import { setRemoteImageStore, setShareOrigin } from "@/shared/lib/dom";
import { warmPreloadedImages } from "@/shared/lib/image-cache";
import {
  createRemoteRealtime,
  createWsRealtime,
  getConnectionStatus,
  setRealtime,
  subscribeConnection,
} from "@/shared/lib/realtime";
import {
  REMOTE_TOKEN_KEY,
  REMOTE_USER_KEY,
  getActiveUserId,
  getRemoteToken,
  markClientOutdated,
  markRemoteSessionExpired,
  readRemoteUserId,
  setLastUserKey,
  useSessionStore,
} from "@/shared/store";

// Сразу при загрузке модуля, до гидрации и до проверки режима: мок-сервер и
// каталог качаются параллельно с ней (shared/api/warmup.ts), а обложка из
// HTML декодируется заранее (shared/lib/image-cache). Сборке для сервера
// (remote) мок и каталог из статики не нужны.
if (!isRemoteBuild()) warmLocalApi();
warmPreloadedImages();

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

// Часы remote — по now из /v1/health (BACKEND.md §9.3), как в lan, но без
// перемотки: она только в демо. Заодно minClientBuild (B17): сборка старее —
// экран «Вышла новая версия» (app/app-frame). Проверяется при запуске и
// после каждого возвращения связи — сервер мог обновиться, пока вкладка жила.
const syncRemoteClock = async (base: string) => {
  const response = await fetch(remoteApiUrl(base, "/health"), {
    cache: "no-store",
  });
  const health = (await response.json()) as {
    minClientBuild?: unknown;
    now?: unknown;
  };
  if (typeof health.now === "number") {
    setLanClock({ diffMs: health.now - Date.now(), offsetMs: 0 });
  }
  if (
    typeof health.minClientBuild === "string" &&
    isClientOutdated(CLIENT_BUILD, health.minClientBuild)
  ) {
    markClientOutdated();
  }
};

// Первая сверка часов держит запуск не дольше этого: сервер может не
// ответить, а «Нет связи» покажет WebSocket.
const CLOCK_WAIT_MS = 1500;

// Запуск в режиме remote (BACKEND.md §9.3): транспорт с токеном, сессия,
// часы, WebSocket с hello { token }.
const startRemote = async ({ base }: RemoteInfo) => {
  setLastUserKey(REMOTE_USER_KEY);
  setTransport(remoteTransport);
  // Фото своих желаний — на сервере (POST /v1/uploads), их видят гости
  // ссылки (§9.3). В желании — только ключ.
  setRemoteImageStore({ upload: uploadRemoteImage, urlOf: remoteImageUrl });
  await useSessionStore.persist.rehydrate();
  // Все вкладки браузера — один человек (§3.2): пользователь — тот, чей
  // токен лежит в localStorage, а не id из sessionStorage вкладки (там мог
  // остаться профиль демо с того же адреса). Нет токена — нет и
  // пользователя: SessionGate тихо создаст профиль (POST /users).
  const token = getRemoteToken();
  let userId = token ? readRemoteUserId() : null;
  if (token && !userId) {
    // Токен есть, а id потерялся — спрашиваем сервер, чей это токен. Не
    // ответил — «Сессия закончилась», а не новый профиль поверх старого.
    userId = await getMe().then(
      (me) => me.id,
      () => null,
    );
    if (!userId) markRemoteSessionExpired();
  }
  useSessionStore.getState().setActiveUser(userId);

  const realtime = createRemoteRealtime(remoteWsUrl(base), {
    getToken: getRemoteToken,
    onUnauthorized: markRemoteSessionExpired,
  });
  setRealtime(realtime);
  // Профиль создан (появился токен) или сменился — новый сокет с новым hello.
  useSessionStore.subscribe((state, previous) => {
    if (state.activeUserId !== previous.activeUserId) realtime.reconnect();
  });
  // Другая вкладка вышла, удалила профиль или создала новый — токен сменился,
  // эта вкладка открывается заново тем же человеком, что и остальные.
  window.addEventListener("storage", (event) => {
    if (event.key === REMOTE_TOKEN_KEY) window.location.reload();
  });
  // Вернулась связь — сверить часы заново (сервер мог перезапуститься).
  subscribeConnection(() => {
    if (getConnectionStatus() === "online") {
      void syncRemoteClock(base).catch(() => undefined);
    }
  });
  await Promise.race([
    syncRemoteClock(base).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, CLOCK_WAIT_MS)),
  ]);
};

// Запуск вкладки (TECH_SPEC §6): режим → транспорт, шина, часы, сессия.
// До конца — заставка с бантом (не дольше ~800 ms на определение режима).
let started: null | Promise<ApiMode> = null;

export const startEnvironment = (): Promise<ApiMode> => {
  started ??= (async () => {
    const environment = await detectEnvironment();
    if (environment.mode === "remote" && environment.remote) {
      await startRemote(environment.remote);
    } else if (environment.mode === "lan" && environment.lan) {
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
