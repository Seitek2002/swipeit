import type { ApiMode } from "@swipeit/core/contract";

import { withBasePath } from "@/shared/lib/base-path";

import { getRemoteApiBase } from "./remote-base";

// Режим работы (TECH_SPEC §6 «Определение режима при запуске», BACKEND.md
// §9.1): local — «На этом устройстве», lan — «Локальная сеть», remote —
// настоящий сервер под /v1. Тип общий с сервером (@swipeit/core).
export type { ApiMode };

// shareOrigin — адрес ноутбука в Wi-Fi для ссылок и QR (нет Wi-Fi — нет).
export type LanInfo = { now: number; serverId: string; shareOrigin?: string };

// base — адрес сервера без /v1 (из NEXT_PUBLIC_API_URL).
export type RemoteInfo = { base: string };

export type Environment = {
  lan?: LanInfo;
  mode: ApiMode;
  remote?: RemoteInfo;
};

// При разработке `next dev` можно направить на запущенный LAN-сервер.
const API_ORIGIN = process.env.NEXT_PUBLIC_API_ORIGIN ?? "";
const HEALTH_TIMEOUT_MS = 800;

// Адрес API: в lan — тот же сервер, что отдал страницу.
export const apiUrl = (path: string) =>
  `${API_ORIGIN}${API_ORIGIN ? `/api${path}` : withBasePath(`/api${path}`)}`;

let detection: null | Promise<Environment> = null;
let current: ApiMode = "local";

const probe = async (): Promise<Environment> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HEALTH_TIMEOUT_MS);
  try {
    const response = await fetch(apiUrl("/health"), {
      signal: controller.signal,
      cache: "no-store",
    });
    if (!response.ok) return { mode: "local" };
    const health = (await response.json()) as Partial<{
      app: string;
      mode: string;
      now: number;
      serverId: string;
      shareOrigin: string;
    }>;
    if (
      health.app === "swipeit" &&
      health.mode === "lan" &&
      typeof health.serverId === "string" &&
      typeof health.now === "number"
    ) {
      return {
        mode: "lan",
        lan: {
          serverId: health.serverId,
          now: health.now,
          shareOrigin:
            typeof health.shareOrigin === "string"
              ? health.shareOrigin
              : undefined,
        },
      };
    }
  } catch {
    // Статический хостинг, `next dev`, нет сети — работаем на устройстве.
  } finally {
    clearTimeout(timer);
  }
  return { mode: "local" };
};

// Один раз на вкладку: GET /api/health с таймаутом 800 ms. Ответил
// LAN-сервер SwipeIt — режим lan, иначе local.
// На статическом хостинге (GitHub Pages, `next dev`) отвечает файл
// public/api/health с mode "static" — без 404 в консоли браузера.
//
// Сборка с NEXT_PUBLIC_API_URL — сразу remote, без проверки /api/health на
// своём адресе (BACKEND.md §9.1). Сервер не ответит — остаёмся в remote и
// показываем «Нет связи»: уйди мы в local, человек создал бы профиль в
// браузере и потом потерял бы его.
const detect = async (): Promise<Environment> => {
  const base = getRemoteApiBase();
  if (base) return { mode: "remote", remote: { base } };
  return probe();
};

export const detectEnvironment = (): Promise<Environment> => {
  detection ??= detect().then((environment) => {
    current = environment.mode;
    return environment;
  });
  return detection;
};

export const detectMode = async (): Promise<ApiMode> =>
  (await detectEnvironment()).mode;

// Режим после определения (до него — local).
export const getMode = (): ApiMode => current;
