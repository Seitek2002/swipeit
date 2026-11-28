import { REMOTE_COPY } from "@/shared/config/remote-copy";

import { shortErrorCode, withErrorCode } from "./error-code";
import { ApiError, type ApiErrorCode, isApiError } from "./mock-server/errors";

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
  RATE_LIMITED: REMOTE_COPY.rateLimited,
  UNAUTHORIZED: REMOTE_COPY.sessionExpiredTitle,
};

const DEFAULT_MESSAGE = REMOTE_COPY.internalError;

// Тексты фронта главнее текста сервера (S07): у сервера на INTERNAL и общий
// лимит запросов — служебные фразы, а человеку нужны фразы из R07.
// Исключение — свой лимит у маршрута (фото: «Слишком много фото — попробуй
// позже», лимит в час, а не в минуту): его текст оставляет ownRateLimit.
const CLIENT_TEXT: Partial<Record<ApiErrorCode, string>> = {
  INTERNAL: REMOTE_COPY.internalError,
  RATE_LIMITED: REMOTE_COPY.rateLimited,
};

type Options = {
  // У маршрута свой лимит со своим текстом — 429 показать текстом сервера.
  ownRateLimit?: boolean;
};

const requestIdOf = (value: unknown): string | undefined =>
  typeof value === "string" && value.length > 0 && value.length <= 100
    ? value
    : undefined;

// Ответ сервера с ошибкой → ApiError, как у мока: экраны различают ошибки
// по code, а message показывают человеку (он по-русски, §4.5).
//
// requestId (S08) — из тела, иначе из заголовка x-request-id (если прокси
// отдал свою страницу). У INTERNAL код из 8 символов дописан к тексту:
// человек назовёт его владельцу, а тот найдёт сбой в логах.
export const remoteErrorFromResponse = (
  status: number,
  body: unknown,
  headerRequestId?: null | string,
  options: Options = {},
): ApiError => {
  const error =
    typeof body === "object" && body !== null
      ? (body as { code?: unknown; message?: unknown; requestId?: unknown })
      : {};
  const code =
    typeof error.code === "string" && KNOWN_CODES.has(error.code)
      ? (error.code as ApiErrorCode)
      : codeByStatus(status);
  const serverText =
    typeof error.message === "string" && error.message.trim()
      ? error.message
      : null;
  const clientText =
    code === "RATE_LIMITED" && options.ownRateLimit
      ? undefined
      : CLIENT_TEXT[code];
  const message =
    clientText ?? serverText ?? MESSAGE_BY_CODE[code] ?? DEFAULT_MESSAGE;
  const requestId =
    requestIdOf(error.requestId) ?? requestIdOf(headerRequestId ?? undefined);
  const shortCode = code === "INTERNAL" ? shortErrorCode(requestId) : null;
  return new ApiError(
    status,
    code,
    shortCode ? withErrorCode(message, shortCode) : message,
    requestId,
  );
};

// Код ошибки для экрана (S08): первые 8 символов requestId, если ответ
// сервера был. Нет ответа (OFFLINE без связи), мок или LAN — null.
export const errorCodeOf = (error: unknown): null | string =>
  isApiError(error) ? shortErrorCode(error.requestId) : null;
