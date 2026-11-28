// Приглашения в план и игру короткой ссылкой — только режим remote
// (BACKEND.md §6.2). В local и lan ссылка — адрес экрана с id, как раньше.
export type InviteKind = "plan" | "santa";

// Ответ POST /share-links: url — адрес сервера «…/s/<код>».
export type InviteLink = { code: string; url: string };

// Ответ GET /share/:code. Вишлист и «Выбери подарок сам» разбирают свои
// экраны — для приглашений важно лишь, что это не план и не игра.
export type ShareTarget =
  | { gameId: string; kind: "santa" }
  | { kind: "pick_answer" | "pick_request" | "wishlist" }
  | { kind: "plan"; planId: string };
