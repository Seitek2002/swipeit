import { getActiveUserId } from "@/shared/store";

import { onMockServerLoaded } from "./browser-bots";
import { ApiError } from "./mock-server/errors";
import type { HttpMethod } from "./mock-server/routes";

export type { HttpMethod };

// refetch — фоновое перечитывание экрана, а не открытие: сервер remote по
// заголовку x-swipeit-refetch: 1 не ставит дружбу по ссылке (Q07). Мок и
// LAN его не читают.
//
// quiet — служебный запрос без последствий для экрана (воронка R09): 401 не
// открывает «Сессия закончилась», 429 не считается увиденным человеком.
export type RequestOptions = { quiet?: boolean; refetch?: boolean };

export type Transport = {
  request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
    options?: RequestOptions,
  ): Promise<T>;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Искусственная задержка мок-API (TECH_SPEC §6): 150–450 ms, чтобы состояния
// загрузки было видно. «Без задержек» в демо-панели её отключает.
const MIN_DELAY = 150;
const DELAY_SPREAD = 300;
const ERROR_RATE = 0.1;

// Режим local: запросы обрабатывает мок-сервер прямо во вкладке. Модуль
// сервера грузится лениво — в режиме lan (T12b) он не нужен вовсе.
export const mockTransport: Transport = {
  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ) {
    const mockServer = await import("./mock-server/adapters/browser");
    const server = mockServer.getBrowserMockServer();
    // Боты local живут рядом с мок-сервером и стартуют с первым запросом к
    // нему (browser-bots.ts): так мок не грузится на экранах без данных.
    onMockServerLoaded(mockServer);
    const settings = server.deps.settings.get();
    if (!settings.noDelays)
      await sleep(MIN_DELAY + Math.random() * DELAY_SPREAD);
    // «Случайные ошибки 10%» — кроме самих демо-настроек, иначе демо-панель
    // перестаёт слушаться.
    if (
      settings.randomErrors &&
      !path.startsWith("/demo") &&
      Math.random() < ERROR_RATE
    ) {
      throw new ApiError(503, "OFFLINE", "Связь пропала. Попробуй ещё раз");
    }
    const result = await server.handle({
      method,
      path,
      body: body === undefined ? undefined : structuredClone(body),
      query,
      userId: getActiveUserId(),
    });
    // Копия: никто не должен менять базу по ссылке из ответа.
    return structuredClone(result) as T;
  },
};

let current: Transport = mockTransport;

// Транспорт выбирается один раз при запуске (shared/api/mode.ts). Запросы
// по доменам зовут только его — им всё равно, мок под ними или сервер.
export const getTransport = (): Transport => current;

export const setTransport = (transport: Transport) => {
  current = transport;
};
