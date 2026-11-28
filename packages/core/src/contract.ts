// Контракт API (BACKEND.md §2.2, §4.4, B02): для каждого маршрута — метод,
// путь, кто может и в каких режимах он есть. Мок (local), LAN-сервер (lan) и
// backend (remote) привязаны к нему: тест мока ловит расхождение с его
// таблицей маршрутов, сервер регистрирует маршруты отсюда (B04).

export type ApiMode = "lan" | "local" | "remote";
export type HttpMethod = "DELETE" | "GET" | "PATCH" | "POST";

// public — без токена (каталог, создание профиля, разбор старой ссылки);
// user — нужен профиль. Права тоньше (свой, друг, участник) проверяет
// обработчик (§4.4).
export type RouteAccess = "public" | "user";

export type ContractRoute = {
  access: RouteAccess;
  method: HttpMethod;
  modes: readonly ApiMode[];
  path: string;
};

const EVERYWHERE = ["local", "lan", "remote"] as const;
// Демо: перемотка, боты, «Смотреть как», планировщик во вкладке.
const DEMO = ["local", "lan"] as const;
// Только с сервером в сети: фото, часы, ссылки, вход.
const NETWORK = ["lan", "remote"] as const;
const REMOTE = ["remote"] as const;

const route = (
  method: HttpMethod,
  path: string,
  access: RouteAccess = "user",
  modes: readonly ApiMode[] = EVERYWHERE,
): ContractRoute => ({ method, path, access, modes });

export const CONTRACT: readonly ContractRoute[] = [
  // Здоровье и вход
  route("GET", "/health", "public", NETWORK),
  route("POST", "/users", "public"),
  route("POST", "/auth/demo", "public", DEMO),
  route("POST", "/auth/telegram", "public", REMOTE),
  route("POST", "/auth/logout", "user", REMOTE),
  route("DELETE", "/me", "user", REMOTE),

  // Профиль, даты, друзья
  route("GET", "/me"),
  route("PATCH", "/me"),
  route("POST", "/me/hints"),
  route("GET", "/me/dates"),
  route("POST", "/me/dates"),
  route("PATCH", "/me/dates/:id"),
  route("DELETE", "/me/dates/:id"),
  route("GET", "/me/reminders"),
  route("POST", "/me/reminders/:id/dismiss"),
  route("GET", "/users/:id"),
  route("GET", "/friends"),
  route("GET", "/presence", "user", ["lan"]),

  // Каталог и свайпы
  route("GET", "/catalog/feed"),
  route("GET", "/catalog/count"),
  route("GET", "/catalog/products/:id", "public"),
  route("GET", "/catalog/meta", "public"),
  route("GET", "/catalog/stores", "public"),
  route("GET", "/activities", "public"),
  route("POST", "/swipes"),
  route("POST", "/swipes/undo"),
  route("POST", "/swipes/restart"),

  // Вишлист, ссылки, брони
  route("GET", "/wishlist"),
  route("POST", "/wishlist/items"),
  route("PATCH", "/wishlist/items/:id"),
  route("DELETE", "/wishlist/items/:id"),
  route("POST", "/wishlist/items/:id/undelete"),
  route("POST", "/wishlist/reorder"),
  route("POST", "/wishlist/items/:id/given"),
  route("POST", "/wishlist/items/:id/restore"),
  route("PATCH", "/wishlist/meta"),
  route("POST", "/wishlist/share"),
  route("POST", "/wishlist/given-hint/dismiss"),
  route("POST", "/share-links", "user", REMOTE),
  route("GET", "/share/:code", "public", REMOTE),
  route("GET", "/users/:id/wishlist"),
  route("POST", "/external-wishlists", "public"),
  route("GET", "/reservations"),
  route("POST", "/reservations"),
  route("DELETE", "/reservations/:id"),
  // «Я дарю» — свои брони на «Друзьях» (auto-tasks P02).
  route("GET", "/me/reservations"),

  // «Выбери подарок сам»
  route("POST", "/pick-requests"),
  route("GET", "/pick-requests/:id/picks"),
  route("POST", "/pick-requests/:id/answer"),
  route("POST", "/pick-answers"),

  // Планы
  route("GET", "/plans"),
  route("POST", "/plans"),
  route("POST", "/plans/expire", "user", DEMO),
  route("GET", "/plans/:id"),
  route("POST", "/plans/:id/join"),
  route("POST", "/plans/:id/ready"),
  route("POST", "/plans/:id/start"),
  route("POST", "/plans/:id/swipes"),
  route("POST", "/plans/:id/swipes/undo"),
  route("POST", "/plans/:id/finish"),
  route("POST", "/plans/:id/votes"),
  // «Показать итоги сейчас» — организатор, не дожидаясь всех (P04).
  route("POST", "/plans/:id/close"),
  // «Выйти из плана» — участник, не организатор, до итогов (Q04).
  route("POST", "/plans/:id/leave"),
  route("POST", "/plans/:id/decide"),
  route("POST", "/plans/:id/decide/cancel"),
  route("POST", "/plans/:id/rule"),
  route("POST", "/plans/:id/activities"),
  route("POST", "/activities"),

  // Тайный Санта
  route("GET", "/santa"),
  route("POST", "/santa"),
  route("POST", "/santa/tick", "user", DEMO),
  route("GET", "/santa/:id"),
  route("PATCH", "/santa/:id"),
  route("POST", "/santa/:id/join"),
  route("POST", "/santa/:id/draw"),
  route("POST", "/santa/:id/open"),
  route("POST", "/santa/:id/bought"),
  // До жеребьёвки: выйти самому и убрать участника (auto-tasks-pm-2 Q05).
  route("POST", "/santa/:id/leave"),
  route("DELETE", "/santa/:id/members/:userId"),

  // Фото своих желаний и занятий
  route("POST", "/uploads", "user", NETWORK),
  route("GET", "/uploads/:key", "public", NETWORK),

  // Демо-панель
  route("POST", "/demo/reset", "user", DEMO),
  route("POST", "/demo/hints/reset", "user", DEMO),
  route("POST", "/demo/clock/to-reminder", "user", DEMO),
  route("POST", "/demo/scenario/new-year", "user", DEMO),
  route("GET", "/demo/settings", "user", DEMO),
  route("PATCH", "/demo/settings", "user", DEMO),
  route("GET", "/demo/users", "user", DEMO),
];

export const contractFor = (mode: ApiMode): ContractRoute[] =>
  CONTRACT.filter((item) => item.modes.includes(mode));

export const routeKey = (method: HttpMethod, path: string) =>
  `${method} ${path}`;
