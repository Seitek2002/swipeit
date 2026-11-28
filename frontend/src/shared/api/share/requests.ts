import { getTransport } from "../transport";
import type { ShareView } from "./types";

// Экран по короткой ссылке (?s=<код>, только remote). Открыть может и гость
// без профиля. refetch — фоновое перечитывание, а не открытие: так сервер
// не делает гостя другом владельцу при каждом перечитывании (Q07).
export const getShare = (
  code: string,
  options: { refetch?: boolean } = {},
): Promise<ShareView> =>
  getTransport().request<ShareView>(
    "GET",
    `/share/${encodeURIComponent(code)}`,
    undefined,
    undefined,
    options,
  );
