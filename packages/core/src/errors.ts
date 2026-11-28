// Ошибка API — одна и та же у мока и сервера (TECH_SPEC §6, BACKEND.md §4.5).
export type ApiErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  // 500: подробности — только в логе сервера по requestId (BACKEND.md §4.5).
  | "INTERNAL"
  // Действие, где имя увидят другие, а профиль ещё без имени (TECH_SPEC §6).
  // Клиент открывает NameSheet и повторяет запрос.
  | "NAME_REQUIRED"
  | "NOT_FOUND"
  | "OFFLINE"
  // 429: слишком часто (лимиты запросов, BACKEND.md §10).
  | "RATE_LIMITED"
  | "STORAGE_FULL"
  // 401: нет токена, он неверный или сессия закрыта (BACKEND.md §3.2).
  | "UNAUTHORIZED"
  | "VALIDATION";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  // requestId из ответа сервера (remote, auto-tasks-pm-4 S08): по нему
  // владелец находит сбой в логах. У мока и LAN его нет.
  readonly requestId?: string;
  readonly status: number;

  constructor(
    status: number,
    code: ApiErrorCode,
    message: string,
    requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    if (requestId) this.requestId = requestId;
  }
}

export const isApiError = (value: unknown): value is ApiError =>
  value instanceof ApiError ||
  (typeof value === "object" &&
    value !== null &&
    (value as { name?: unknown }).name === "ApiError" &&
    typeof (value as { code?: unknown }).code === "string");

export const notFound = (message: string) =>
  new ApiError(404, "NOT_FOUND", message);

export const validation = (message: string) =>
  new ApiError(400, "VALIDATION", message);

export const unauthorized = (
  message = "Сессия закончилась. Войди снова или начни заново",
) => new ApiError(401, "UNAUTHORIZED", message);

export const forbidden = (message: string) =>
  new ApiError(403, "FORBIDDEN", message);

export const conflict = (message: string) =>
  new ApiError(409, "CONFLICT", message);

// Профиль без имени пытается сделать то, где его увидят другие: отправить
// вишлист, позвать в план или Санту, забронировать подарок (DESIGN §8.1).
// Клиент спрашивает имя заранее, но сервер проверяет сам — это контракт для
// будущего бэкенда. 409: запрос верный, мешает состояние профиля.
export const nameRequired = () =>
  new ApiError(409, "NAME_REQUIRED", "Сначала напиши, как тебя зовут");

// На NAME_REQUIRED клиент открывает NameSheet и повторяет запрос.
export const isNameRequired = (value: unknown): value is ApiError =>
  isApiError(value) && value.code === "NAME_REQUIRED";
