import { ApiError, type ApiErrorCode } from "./mock-server/errors";

// Коды ошибок сервера (BACKEND.md §4.5). Новые против LAN — UNAUTHORIZED,
// RATE_LIMITED и INTERNAL.
const KNOWN_CODES: ReadonlySet<string> = new Set<ApiErrorCode>([
  "CONFLICT",
  "FORBIDDEN",
  "INTERNAL",
  "NAME_REQUIRED",
  "NOT_FOUND",
  "OFFLINE",
  "RATE_LIMITED",
  "STORAGE_FULL",
  "UNAUTHORIZED",
  "VALIDATION",
]);

// Код по статусу — если тело не наше (прокси, балансировщик, HTML вместо
// JSON). 502–504 — сервер недоступен: это сбой связи, его стоит повторить.
const codeByStatus = (status: number): ApiErrorCode => {
  if (status === 401) return "UNAUTHORIZED";
  if (status === 403) return "FORBIDDEN";
  if (status === 404) return "NOT_FOUND";
  if (status === 409) return "CONFLICT";
  if (status === 429) return "RATE_LIMITED";
  if (status === 500) return "INTERNAL";
  if (status >= 500) return "OFFLINE";
  return "VALIDATION";
};

const MESSAGE_BY_CODE: Partial<Record<ApiErrorCode, string>> = {
  OFFLINE: "Нет связи с сервером. Попробуй ещё раз",
  RATE_LIMITED: "Слишком часто. Подожди немного и попробуй ещё раз",
  UNAUTHORIZED: "Сессия закончилась",
};

const DEFAULT_MESSAGE = "Что-то пошло не так. Попробуй ещё раз";

// Ответ сервера с ошибкой → ApiError, как у мока: экраны различают ошибки
// по code, а message показывают человеку (он по-русски, §4.5).
export const remoteErrorFromResponse = (
  status: number,
  body: unknown,
): ApiError => {
  const error =
    typeof body === "object" && body !== null
      ? (body as { code?: unknown; message?: unknown })
      : {};
  const code =
    typeof error.code === "string" && KNOWN_CODES.has(error.code)
      ? (error.code as ApiErrorCode)
      : codeByStatus(status);
  const message =
    typeof error.message === "string" && error.message.trim()
      ? error.message
      : (MESSAGE_BY_CODE[code] ?? DEFAULT_MESSAGE);
  return new ApiError(status, code, message);
};
