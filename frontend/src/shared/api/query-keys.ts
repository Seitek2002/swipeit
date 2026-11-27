import type { RealtimeScope } from "@/shared/lib/realtime/types";

import type { ProductFilters } from "./catalog/types";
import type { PlanFilters } from "./plans/types";

// Фабрики ключей React Query по доменам (как в imbir: all → lists → detail).
// Ключи — только отсюда: строки мимо фабрики не достаёт точечная
// инвалидация (анти-паттерн A3 из imbir).

export const userKeys = {
  all: ["users"] as const,
  me: () => [...userKeys.all, "me"] as const,
  // Свои даты и напоминания — под users: их перечитывает область "users".
  dates: () => [...userKeys.all, "me", "dates"] as const,
  reminders: () => [...userKeys.all, "me", "reminders"] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
};

export const friendKeys = {
  all: ["friends"] as const,
  list: () => [...friendKeys.all, "list"] as const,
  presence: () => [...friendKeys.all, "presence"] as const,
};

export const catalogKeys = {
  all: ["catalog"] as const,
  feed: (context: string, filters: ProductFilters) =>
    [...catalogKeys.all, "feed", context, filters] as const,
  count: (context: string, filters: ProductFilters) =>
    [...catalogKeys.all, "count", context, filters] as const,
  product: (id: string) => [...catalogKeys.all, "product", id] as const,
  // meta.json не меняется, пока открыта вкладка — его не инвалидируем.
  meta: () => [...catalogKeys.all, "meta"] as const,
};

export const wishlistKeys = {
  all: ["wishlist"] as const,
  mine: () => [...wishlistKeys.all, "mine"] as const,
  user: (userId: string) => [...wishlistKeys.all, "user", userId] as const,
  external: (encoded: string) =>
    [...wishlistKeys.all, "external", encoded] as const,
};

export const reservationKeys = {
  all: ["reservations"] as const,
  forOwner: (ownerId: string) => [...reservationKeys.all, ownerId] as const,
};

export const pickKeys = {
  all: ["pick"] as const,
  picks: (requestId: string) => [...pickKeys.all, "picks", requestId] as const,
  answer: (encoded: string) => [...pickKeys.all, "answer", encoded] as const,
};

export const planKeys = {
  all: ["plans"] as const,
  list: () => [...planKeys.all, "list"] as const,
  detail: (id: string) => [...planKeys.all, "detail", id] as const,
};

export const santaKeys = {
  all: ["santa"] as const,
  list: () => [...santaKeys.all, "list"] as const,
  detail: (id: string) => [...santaKeys.all, "detail", id] as const,
};

// Занятия каталога (GET /activities). Каталог только для чтения, поэтому
// в SCOPE_KEYS его нет.
export const activityKeys = {
  all: ["activities"] as const,
  list: (filters?: PlanFilters) =>
    [...activityKeys.all, "list", filters ?? null] as const,
};

export const demoKeys = {
  all: ["demo"] as const,
  settings: () => [...demoKeys.all, "settings"] as const,
  users: () => [...demoKeys.all, "users"] as const,
};

// Что перечитать, когда пришло событие db:changed с этой областью
// (TECH_SPEC §7: подписчик в providers.tsx). Остальные домены добавятся
// вместе со своими задачами.
export const SCOPE_KEYS: Record<
  RealtimeScope,
  ReadonlyArray<readonly string[]>
> = {
  users: [userKeys.all, friendKeys.all, demoKeys.all],
  swipes: [catalogKeys.all, pickKeys.all],
  // Санта — тоже: статус «вишлист готов» и вишлист подопечного зависят от
  // чужих вишлистов, а их изменения приходят только с областью wishlist.
  wishlist: [wishlistKeys.all, santaKeys.all],
  reservations: [reservationKeys.all, wishlistKeys.all],
  plans: [planKeys.all],
  santa: [santaKeys.all],
  settings: [demoKeys.all],
};
