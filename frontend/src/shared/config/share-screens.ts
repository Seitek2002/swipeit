import { ROUTES } from "./routes";

// Вид ссылки из GET /share/:code (ShareView в shared/api). Тип — свой, без
// импорта из @/shared/api: config читают мок-сервер и контрактные тесты
// backend, а шлюз shared/api тянет код только для браузера.
type ShareKind =
  | { gameId: string; kind: "santa" }
  | { kind: "pick_answer" | "pick_request" | "wishlist" }
  | { kind: "plan"; planId: string };

// Экран фронта для кода короткой ссылки — как его выбирает превью сервера
// /s/<код> (BACKEND.md §6.3). Нужен, когда код открыли не на своём экране
// (например, ссылку-фильтр по /w/?s=): тогда переводим на нужный.
export const shareScreenPath = (view: ShareKind, code: string): string => {
  const s = encodeURIComponent(code);
  switch (view.kind) {
    case "wishlist":
      return `${ROUTES.WISHLIST_GUEST}?s=${s}`;
    case "pick_request":
      return `${ROUTES.PICK_INVITE}?s=${s}`;
    case "pick_answer":
      return `${ROUTES.PICK_ANSWER}?s=${s}`;
    case "plan":
      return ROUTES.PLAN_JOIN(view.planId);
    case "santa":
      return ROUTES.SANTA_JOIN(view.gameId);
  }
};
