import type { PickAnswer, PickRequest } from "../pick/types";
import type { GuestWishlist } from "../wishlist/types";

// Ответ GET /share/:code (BACKEND.md §6.2) — экран ссылки разбирает свой вид.
// Вишлист — живой, как его видит друг, с фото своих желаний (imageKey).
// В ответе по ссылке-ответу request есть только у автора запроса.
export type ShareView =
  | { answer: PickAnswer; kind: "pick_answer"; request: null | PickRequest }
  | { gameId: string; kind: "santa" }
  | { kind: "pick_request"; request: PickRequest }
  | { kind: "plan"; planId: string }
  | { kind: "wishlist"; ownerId: string; wishlist: GuestWishlist };
