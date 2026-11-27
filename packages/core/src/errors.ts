// Ошибка API — одна и та же у мока и будущего бэкенда (TECH_SPEC §6).
export type ApiErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
  // Действие, где имя увидят другие, а профиль ещё без имени (TECH_SPEC §6).
  // Клиент открывает NameSheet и повторяет запрос.
  | "NAME_REQUIRED"
  | "NOT_FOUND"
  | "OFFLINE"
  | "STORAGE_FULL"
  | "VALIDATION";

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;

  constructor(status: number, code: ApiErrorCode, message: string) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
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

// Профиль без имени пытается сделать то, где его увидят другие: отправить
// вишлист, позвать в план или Санту, забронировать подарок (DESIGN §8.1).
// Клиент спрашивает имя заранее, но сервер проверяет сам — это контракт для
// будущего бэкенда. 409: запрос верный, мешает состояние профиля.
export const nameRequired = () =>
  new ApiError(409, "NAME_REQUIRED", "Сначала напиши, как тебя зовут");

// На NAME_REQUIRED клиент открывает NameSheet и повторяет запрос.
export const isNameRequired = (value: unknown): value is ApiError =>
  isApiError(value) && value.code === "NAME_REQUIRED";
