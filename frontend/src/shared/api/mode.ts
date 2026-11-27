import { withBasePath } from "@/shared/lib/base-path";

// Режим работы (TECH_SPEC §6 «Определение режима при запуске»):
// local — «На этом устройстве», lan — «Локальная сеть».
export type ApiMode = "lan" | "local";

// shareOrigin — адрес ноутбука в Wi-Fi для ссылок и QR (нет Wi-Fi — нет).
export type LanInfo = { now: number; serverId: string; shareOrigin?: string };

export type Environment = { lan?: LanInfo; mode: ApiMode };

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
export const detectEnvironment = (): Promise<Environment> => {
  detection ??= probe().then((environment) => {
    current = environment.mode;
    return environment;
  });
  return detection;
};

export const detectMode = async (): Promise<ApiMode> =>
  (await detectEnvironment()).mode;

// Режим после определения (до него — local).
export const getMode = (): ApiMode => current;
