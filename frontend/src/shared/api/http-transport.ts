import { getActiveUserId } from "@/shared/store";

import { ApiError, type ApiErrorCode } from "./mock-server/errors";
import { apiUrl } from "./mode";
import type { Transport } from "./transport";

const KNOWN_CODES: ApiErrorCode[] = [
  "CONFLICT",
  "FORBIDDEN",
  "NAME_REQUIRED",
  "NOT_FOUND",
  "OFFLINE",
  "STORAGE_FULL",
  "VALIDATION",
];

const toQuery = (query?: Record<string, unknown>) => {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null) continue;
    params.set(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
};

// Режим lan (TECH_SPEC §6): fetch на /api/<path> LAN-сервера. Пользователь
// вкладки — заголовком x-user-id (сеть доверенная, без авторизации). После
// демо тот же транспорт пойдёт на настоящий бэкенд.
export const httpTransport: Transport = {
  async request<T>(
    method: string,
    path: string,
    body?: unknown,
    query?: Record<string, unknown>,
  ) {
    const headers: Record<string, string> = {};
    const userId = getActiveUserId();
    if (userId) headers["x-user-id"] = userId;
    if (body !== undefined) headers["content-type"] = "application/json";
    let response: Response;
    try {
      response = await fetch(apiUrl(path) + toQuery(query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        cache: "no-store",
      });
    } catch {
      throw new ApiError(0, "OFFLINE", "Нет связи с ноутбуком");
    }
    const NOT_JSON = Symbol("not-json");
    const data = (await response.json().catch(() => NOT_JSON)) as unknown;
    // Вместо API ответило что-то другое (прокси, статика с HTML) — это
    // сбой связи, а не пустой ответ.
    if (response.ok && data === NOT_JSON) {
      throw new ApiError(
        response.status,
        "OFFLINE",
        "Сервер ответил непонятно. Проверь адрес ноутбука",
      );
    }
    if (!response.ok) {
      const error = (data === NOT_JSON || !data ? {} : data) as {
        code?: string;
        message?: string;
      };
      const code = KNOWN_CODES.includes(error.code as ApiErrorCode)
        ? (error.code as ApiErrorCode)
        : response.status >= 500
          ? "OFFLINE"
          : "VALIDATION";
      throw new ApiError(
        response.status,
        code,
        error.message ?? "Что-то пошло не так. Попробуй ещё раз",
      );
    }
    return data as T;
  },
};
