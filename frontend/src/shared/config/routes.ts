// Все пути приложения (TECH_SPEC §10). В JSX и router.push — только отсюда.
// `trailingSlash: true` в next.config: каждый путь заканчивается на «/».
// basePath (GitHub Pages) сюда не входит — его добавляют <Link> и router.
export const ROUTES = {
  HOME: "/",
  ONBOARDING: "/onboarding/",
  GIFTS: "/gifts/",
  WISHLIST: "/wishlist/",
  WISHLIST_GUEST: "/w/",
  PICK_INVITE: "/pick/",
  PICK_ANSWER: "/pick/answer/",
  PLANS: "/plans/",
  PLAN_CREATE: "/plans/new/",
  PLAN_SESSION: (id: string) => `/plans/session/?id=${encodeURIComponent(id)}`,
  PLAN_JOIN: (id: string) => `/plans/join/?id=${encodeURIComponent(id)}`,
  SANTA: "/santa/",
  SANTA_CREATE: "/santa/new/",
  SANTA_GAME: (id: string) => `/santa/game/?id=${encodeURIComponent(id)}`,
  SANTA_JOIN: (id: string) => `/santa/join/?id=${encodeURIComponent(id)}`,
  FRIENDS: "/friends/",
  FRIEND_PROFILE: (id: string) =>
    `/friends/profile/?id=${encodeURIComponent(id)}`,
  PROFILE: "/profile/",
  KIT: "/kit/",
} as const;

export type TabId = "gifts" | "plans" | "santa" | "wishlist";

// Пути без хвостового «/»: usePathname в разных режимах отдаёт его по-разному.
// null — usePathname до готовности роутера (в типах Next 16.4 он nullable).
const normalize = (pathname: null | string) => {
  if (!pathname) return "/";
  return pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
};

// Где таб-бар есть (TECH_SPEC §10, колонка «Таб-бар»). Всё остальное — «потоки»
// без таб-бара: онбординг, создание, свайп плана, чужие ссылки, витрина.
// /plans/session/ показывает таб-бар только на результатах — это решает сама
// страница (по статусу плана), поэтому здесь его нет.
const TAB_BAR_PATHS = new Set([
  "/gifts",
  "/wishlist",
  "/plans",
  "/santa",
  "/santa/game",
  "/friends",
  "/friends/profile",
  "/profile",
]);

export const hasTabBar = (pathname: null | string): boolean =>
  TAB_BAR_PATHS.has(normalize(pathname));

// Активный таб по разделу: /santa/game/ подсвечивает «Санту». Друзья и профиль
// открываются аватаром из шапки и ни один таб не подсвечивают.
export const getActiveTab = (pathname: null | string): null | TabId => {
  const path = normalize(pathname);
  if (path.startsWith("/gifts")) return "gifts";
  if (path.startsWith("/wishlist")) return "wishlist";
  if (path.startsWith("/plans")) return "plans";
  if (path.startsWith("/santa")) return "santa";
  return null;
};

// Экраны, которые открываются без профиля: онбординг, чужие ссылки (гость
// без регистрации, DESIGN.md §8.5), приглашения (вход решают сами экраны) и
// витрина. Остальные без профиля ведут в онбординг.
const GUEST_PATHS = new Set([
  "/",
  "/onboarding",
  "/w",
  "/pick",
  "/pick/answer",
  "/plans/join",
  "/santa/join",
  "/kit",
  "/credits",
]);

export const requiresProfile = (pathname: null | string): boolean =>
  !GUEST_PATHS.has(normalize(pathname));
