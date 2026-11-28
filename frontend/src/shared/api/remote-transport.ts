import { getRemoteToken, markRemoteSessionExpired } from "@/shared/store";

import { CLIENT_BUILD } from "./client-build";
import { trackStep } from "./funnel";
import { toQuery } from "./http-transport";
import { ApiError } from "./mock-server/errors";
import { getRemoteApiBase, remoteApiUrl } from "./remote-base";
import { remoteErrorFromResponse } from "./remote-errors";
import type { HttpMethod, RequestOptions, Transport } from "./transport";

// Тайм-аут запроса и один повтор GET при обрыве (BACKEND.md §9.2): в
// мобильной сети запрос иногда висит без ответа, а GET повторять безопасно.
const TIMEOUT_MS = 15_000;
const GET_ATTEMPTS = 2;

const OFFLINE_MESSAGE = "Нет связи с сервером. Проверь интернет";

const send = async (url: string, init: RequestInit): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

// Режим remote: fetch на <NEXT_PUBLIC_API_URL>/v1/<path>, человек — по
// токену сессии (Authorization: Bearer), а не x-user-id, как в LAN.
export const remoteTransport: Transport = {
  async request<T>(
    method: HttpMethod,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
    options?: RequestOptions,
  ) {
    const base = getRemoteApiBase();
    if (!base) throw new Error("remote-transport без NEXT_PUBLIC_API_URL");
    // Сборка фронта — в x-client-build, он попадает в логи сервера (§4.5).
    const headers: Record<string, string> = { "x-client-build": CLIENT_BUILD };
    const token = getRemoteToken();
    if (token) headers.authorization = `Bearer ${token}`;
    if (body !== undefined) headers["content-type"] = "application/json";
    // Фоновое перечитывание — x-swipeit-refetch (Q07): дружбу по ссылке
    // ставит только настоящее открытие экрана.
    if (options?.refetch) headers["x-swipeit-refetch"] = "1";
    const url = remoteApiUrl(base, path) + toQuery(query);
    const init: RequestInit = {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    };

    let response: null | Response = null;
    const attempts = method === "GET" ? GET_ATTEMPTS : 1;
    for (let attempt = 0; attempt < attempts && !response; attempt += 1) {
      try {
        response = await send(url, init);
      } catch {
        // Обрыв или тайм-аут. POST/PATCH/DELETE не повторяем: сервер мог
        // успеть выполнить запрос, и повтор сделал бы его дважды.
      }
    }
    if (!response) throw new ApiError(0, "OFFLINE", OFFLINE_MESSAGE);

    const NOT_JSON = Symbol("not-json");
    const data = (await response.json().catch(() => NOT_JSON)) as unknown;
    if (!response.ok) {
      const error = remoteErrorFromResponse(
        response.status,
        data === NOT_JSON ? null : data,
      );
      // Токен неверный или сессия закрыта — экран «Сессия закончилась»
      // (app/session-gate). Новый профиль молча не создаём (§3.2). Без
      // токена 401 — не конец сессии, а маршрут только для профиля: гость
      // приглашения спросил план до «Вступить». Иначе после вступления его
      // встретил бы экран «Сессия закончилась».
      //
      // Служебный запрос (quiet, воронка) экран не трогает: ни «Сессия
      // закончилась», ни шага rate_limited_seen — иначе 429 на /me/funnel
      // слал бы /me/funnel снова.
      if (!options?.quiet) {
        if (error.code === "UNAUTHORIZED" && token) markRemoteSessionExpired();
        // «Слишком часто» дойдёт до человека текстом ошибки (R07, R09).
        if (error.code === "RATE_LIMITED") trackStep("rate_limited_seen");
      }
      throw error;
    }
    // Вместо API ответило что-то другое (прокси, статика с HTML) — сбой
    // связи, а не пустой ответ.
    if (data === NOT_JSON) {
      throw new ApiError(
        response.status,
        "OFFLINE",
        "Сервер ответил непонятно. Попробуй ещё раз",
      );
    }
    return data as T;
  },
};
