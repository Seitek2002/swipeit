// Ошибка API — одна и та же у мока и будущего бэкенда (TECH_SPEC §6).
export type ApiErrorCode =
  | "CONFLICT"
  | "FORBIDDEN"
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
