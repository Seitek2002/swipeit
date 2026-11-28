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
  CREDITS: "/credits/",
  PRIVACY: "/privacy/",
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

// Экраны, которые открываются без профиля и сами его не создают: «/» (ведёт
// в ленту), бывший онбординг (редирект), чужие ссылки (гость без регистрации,
// DESIGN.md §8.5), приглашения (профиль — по «Вступить»), витрина, «Авторы
// фото» и «Что SwipeIt хранит» (S11: открывается из шторки имени у гостя).
// Остальные без профиля создают его сами (app/session-gate.tsx).
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
  "/privacy",
]);

export const requiresProfile = (pathname: null | string): boolean =>
  !GUEST_PATHS.has(normalize(pathname));

// Экраны, которые рисуются до запуска вкладки (app/environment.ts): их первый
// кадр не зависит от данных, режима и сессии, поэтому он есть уже в
// статическом HTML — человек видит экран сразу, а не заставку, пока грузится
// JS. Данные, мутации и плашку режима они сами включают по useAppReady().
// Экраны с профилем сюда не добавлять: до чтения сессии они создали бы
// второй профиль уже вошедшему человеку.
const BEFORE_READY_PATHS = new Set(["/credits"]);

export const rendersBeforeReady = (pathname: null | string): boolean =>
  BEFORE_READY_PATHS.has(normalize(pathname));
