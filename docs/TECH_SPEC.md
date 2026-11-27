# SwipeIt — техническая спецификация фронтенда (демо)

> Для Исполнителя. Продуктовые требования — в [PRD.md](PRD.md), дизайн — в [DESIGN.md](DESIGN.md), порядок работ — в [TASKS.md](TASKS.md).
> Образец архитектуры и стиля кода — проект `../imbir-nextjs` (соседняя папка в `work/`). Перед стартом прочитай его `docs/CODESTYLE.md` целиком (особенно раздел «Анти-паттерны» — их не повторяем) и бегло `docs/ARCHITECTURE.md`.

---

## 1. Главные решения

1. **Next.js App Router со статической сборкой** (`output: "export"`). Никакого серверного кода: ни middleware, ни route handlers, ни server actions, ни запросов данных в серверных компонентах. Благодаря этому `next build` выдаёт папку статики, которую потом можно положить в Capacitor и получить приложение для iOS и Android, работающее офлайн.
2. **Настоящего бэкенда нет — есть мок-сервер.** Весь доступ к данным идёт через слой API с теми же функциями, что будут у настоящего бэкенда на Node.js. Ни один компонент не читает localStorage напрямую.
3. **Мок-сервер изоморфный**: его обработчики — чистый TypeScript без браузерных API. Хранилище, шина событий и часы передаются им снаружи. Поэтому один и тот же код работает в двух режимах:
   - **`local` — «На этом устройстве»**: обработчики выполняются в браузере, данные в localStorage, вкладки синхронизируются через `BroadcastChannel`;
   - **`lan` — «Локальная сеть»**: обработчики выполняются в маленьком Node-сервере на ноутбуке, данные в JSON-файле, телефоны в той же Wi-Fi получают события через WebSocket (см. §7a).
4. **Несколько людей в демо** показываем четырьмя способами:
   - **боты**: демо-друзья сами свайпают, вступают в игры, бронируют подарки (в обоих режимах);
   - **«Смотреть как»**: переключение активного профиля на этом же устройстве;
   - **вкладки**: каждая вкладка браузера — свой участник;
   - **локальная сеть**: каждый телефон — свой участник, живые люди.
5. **Ссылки работают на другом устройстве**: вишлист, ссылка-фильтр и ответ на неё несут данные прямо в URL (сжатый JSON). Каталог одинаковый на всех устройствах, поэтому в ссылке достаточно id товаров.
6. **Демо публичное**: открытый репозиторий и сайт на GitHub Pages, автодеплой из `main` (§13).

---

## 2. Стек

Версии — как в imbir-nextjs, где пересекаются.

| Роль | Пакет |
|---|---|
| Фреймворк | `next@^16.2`, `react@19.2`, `react-dom@19.2`, React Compiler (`babel-plugin-react-compiler`, `reactCompiler: true`) |
| Язык | `typescript@^5`, `strict: true`, `noUncheckedIndexedAccess: true` |
| Стили | `tailwindcss@^4` + `@tailwindcss/postcss`, `clsx` + `tailwind-merge` (хелпер `cn` как в imbir) |
| Серверное состояние | `@tanstack/react-query@^5` (+ devtools только в dev) |
| Клиентское состояние | `zustand@^5` (+ `persist`) |
| Жесты и анимации | `motion` (`motion/react`) |
| Иконки | `lucide-react` |
| Валидация недоверенных данных (ссылки, localStorage) | `zod@^4` |
| Сжатие ссылок | `lz-string` |
| QR | `qrcode` (генерация SVG на клиенте) |
| Хранилище фото своих желаний | `idb-keyval` (IndexedDB) |
| id | `nanoid` |
| Даты | `date-fns` + локаль `ru` |
| Тесты чистой логики | `vitest` |
| Сервер режима «Локальная сеть» (только `frontend/lan/`, в бандл приложения не попадает) | `ws`, `tsx`, `sirv` (раздача статики), `qrcode-terminal` |
| Качество | `eslint@^9` + `eslint-config-next` + `eslint-plugin-perfectionist` (конфиг как в imbir), `prettier` + `@trivago/prettier-plugin-sort-imports` (`.prettierrc` как в imbir), `husky` + `lint-staged`, `steiger` + `@feature-sliced/steiger-plugin` |

Шрифты — через `next/font/google`: `Cormorant_Garamond` (subsets `latin`, `cyrillic`; веса 500, 600, 700; стили normal, italic) и `Onest` (subsets `latin`, `cyrillic`). Подключаются как CSS-переменные `--font-display` и `--font-sans`.

Новые зависимости сверх этого списка — только с обоснованием в описании задачи.

---

## 3. Репозиторий

```
swipeit/
├── docs/                 ← PRD, DESIGN, TECH_SPEC, TASKS, briefs/, design/reference.html
├── catalog/              ← данные от Товароведа
├── frontend/             ← Next.js приложение (вся работа сейчас здесь)
│   └── lan/              ← Node-сервер режима «Локальная сеть» (§7a)
└── backend/              ← пусто, будет Node.js после демо
```

### `next.config.ts`

```ts
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,          // /wishlist/ → wishlist/index.html, нужно для статического хостинга и Capacitor
  images: { unoptimized: true },
  reactCompiler: true,
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
};
```

### Ограничения статической сборки (соблюдать везде)

- **Нет динамических сегментов** вида `[id]`: при экспорте их нужно знать заранее. Id передаём через query: `/plans/session/?id=abc`.
- `useSearchParams()` — только внутри `<Suspense>` (иначе сборка падает).
- `next/image` не используем (оптимизации нет) — обычный `<img>` с `width`/`height` или `aspect-ratio`.
- Всё, что трогает `window`, `localStorage`, `BroadcastChannel`, — только в клиентских компонентах и только после монтирования (хук `useMounted` из imbir).

### Как и в imbir
- Корневая `app/` — только роутинг (тонкие `page.tsx`/`layout.tsx`), реализация — в `src/pages/<slice>`.
- Корневая пустая `pages/` с `README.md`, чтобы Next не принял FSD-слой `src/pages` за Pages Router (см. `imbir-nextjs/pages/README.md`).
- Алиас `@/*` → `./src/*`.

---

## 4. Архитектура FSD

Слои: `app → pages → widgets → features → entities → shared`, импорт только вниз, у каждого слайса публичный `index.ts`. Именование файлов — как в imbir CODESTYLE §1–2 (`ui.tsx`, `model.ts`, `index.ts`, при росте — подпапки `ui/` и `model/`). Хуки-файлы — только `useCamelCase.ts` (в imbir два стиля — анти-паттерн A10).

### Слайсы

```
src/
├── app/                      globals.css (токены из DESIGN.md), providers.tsx (QueryClient, Realtime, BotEngine, Toaster)
├── pages/
│   ├── onboarding/
│   ├── gifts/                свайп подарков
│   ├── wishlist/             мой вишлист
│   ├── wishlist-guest/       чужой вишлист по ссылке
│   ├── pick-invite/          «Выбери подарок сам» — сторона друга
│   ├── pick-answer/          ответ на ссылку-фильтр — сторона отправителя
│   ├── plans/                список планов
│   ├── plan-create/
│   ├── plan-session/         лобби → свайп → результаты → решено
│   ├── plan-join/
│   ├── santa/                список игр
│   ├── santa-create/
│   ├── santa-game/
│   ├── santa-join/
│   ├── friends/
│   ├── friend-profile/
│   ├── profile/
│   └── kit/                  витрина shared/ui (только dev, для приёмки)
├── widgets/
│   ├── app-shell/            рамка телефона на десктопе, фон-бархат, safe-area
│   ├── tab-bar/
│   ├── app-header/
│   ├── gift-deck/            колода подарков + кнопки + WishRibbon
│   ├── activity-deck/        колода билетиков + участники
│   ├── match-overlay/
│   ├── random-drum/
│   ├── santa-envelope/
│   └── demo-panel/
├── features/
│   ├── swipe-deck/           ДВИЖОК колоды (общий для подарков и занятий): жесты, физика, штампы, undo, клавиатура
│   ├── product-filters/      шторка фильтров + счётчик
│   ├── product-details/      шторка «Подробнее» (гостевой вишлист, ответ друга) + выбор варианта; секции подробностей переиспользуются в GiftCard
│   ├── wishlist-share/       шторка отправки, мессенджеры, QR
│   ├── wishlist-edit/        порядок, заметка, вариант, удаление
│   ├── custom-wish/          своё желание
│   ├── reserve-gift/         бронирование гостем
│   ├── pick-request-create/
│   ├── plan-swipe/
│   ├── plan-decide/          голосование и барабан
│   ├── custom-activity/
│   ├── santa-draw/
│   ├── santa-open/
│   ├── profile-switch/       «Смотреть как»
│   └── calendar-export/      .ics
├── entities/
│   ├── user/                 типы, Avatar, AvatarStack, запросы/хуки
│   ├── product/              типы, фото и текстовый блок GiftCard, мини-бирка, скелетон (сама GiftCard с кнопками и подробностями собирается в widgets/gift-deck)
│   ├── activity/             типы, ActivityTicket
│   ├── wishlist/
│   ├── reservation/
│   ├── pick-request/
│   ├── plan/                 типы, PlanPreviewCard, computeMatches()
│   └── santa-game/           типы, drawAssignments()
└── shared/
    ├── api/
    │   ├── transport.ts      единая точка: mock или http (см. §6)
    │   ├── query-keys.ts     фабрики ключей по доменам
    │   ├── <domain>/requests.ts
    │   └── mock-server/      фейковый бэкенд (см. §6)
    ├── ui/                   кит из DESIGN.md §7
    ├── lib/                  format-price, plural, dates, clock, share-codec, share-targets, haptics, realtime, random, image-compress
    ├── config/               routes, categories, interests, marketplaces, constants
    └── store/                session, demo-settings, filters
```

Правила, которые проверяются линтером или на ревью:
- Компонент колоды (`features/swipe-deck`) ничего не знает о товарах и занятиях: получает массив элементов, `renderCard(item)`, разрешённые направления и колбэк `onDecision(item, decision)`.
- Тип данных объявляется один раз в `entities/<x>/model.ts` и реэкспортируется; DTO мок-API = те же типы.
- Отключаешь правило steiger — пиши в `steiger.config.ts`, почему (как в imbir).

---

## 5. Модель данных

Это **контракт**: по нему же Товаровед собирает каталог, по нему потом пишется бэкенд. Поля — `camelCase`. Цены — целые числа в сомах (KGS). Даты — ISO-строки.

```ts
// ── Справочники (shared/config) ───────────────────────────────
type MarketplaceId =
  | "wildberries" | "ozon" | "aliexpress" | "pinduoduo"
  | "temu" | "amazon" | "yandex_market" | "other";

type CategoryId =
  | "tech" | "beauty" | "home" | "kitchen" | "sport" | "outdoor"
  | "books" | "hobby" | "fashion" | "jewelry" | "games" | "kids"
  | "auto" | "pets" | "experiences";

type InterestId = string;        // 20 id из брифа Товароведа (docs/briefs/TOVAROVED.md, §3) → shared/config/interests.ts
type Audience = "all" | "female" | "male";

type ActivityCategoryId = "active" | "chill" | "food" | "culture" | "nature" | "party" | "selfcare";
type ActivityTagId = "outdoor" | "indoor" | "kids_ok" | "evening" | "weekend" | "cheap" | "date" | "big_group";
type Season = "winter" | "spring" | "summer" | "autumn";

// ── Каталог (только чтение, приходит из public/catalog/*.json) ──
interface Product {
  id: string;                    // "p_0001"
  title: string;                 // ≤ 60 символов, без артикулов и мусора
  description: string;           // 1–3 коротких абзаца
  category: CategoryId;
  interests: InterestId[];       // 1–4
  audience: Audience;
  priceMin: number;
  priceMax: number;
  images: ProductImage[];        // 2–5
  variants?: VariantGroup[];
  offers: Offer[];               // ≥ 1
  popularity: number;            // 0..1
}
interface ProductImage { src: string; alt: string; variantOptionId?: string; sourceUrl?: string } // sourceUrl — откуда скачано (для снятия по жалобе)
interface VariantGroup { id: string; kind: "color" | "size" | "other"; label: string; options: VariantOption[] }
interface VariantOption { id: string; label: string; hex?: string }
interface Offer {
  marketplace: MarketplaceId;
  url: string;
  price: number;                 // KGS
  originalPrice?: number;
  originalCurrency?: "RUB" | "USD" | "CNY" | "KGS";
  checkedAt: string;
}

interface Activity {
  id: string;                    // "a_001" или "ca_<nanoid>" для своих
  title: string;
  description: string;
  category: ActivityCategoryId;
  tags: ActivityTagId[];
  pricePerPersonMin: number;
  pricePerPersonMax: number;
  durationMin: number;           // минуты
  durationMax: number;
  seasons: Season[];             // пустой массив = круглый год
  groupSize: { min: number; max: number | null };
  place?: string;                // «Чункурчак», «Bishkek Park»
  distanceNote?: string;         // «40 минут от города»
  image?: { src: string; alt: string };
  isCustom?: boolean;
  createdBy?: string;
}

// public/catalog/meta.json
interface CatalogMeta {
  collectedAt: string;
  rates: { source: string; date: string; RUB: number; USD: number; CNY: number };
  activityPhotoCredits: PhotoCredit[];
}
interface PhotoCredit {
  activityId: string;
  author: string;
  url: string;                   // страница файла на Wikimedia Commons
  license: string;               // «CC BY-SA 4.0», «CC0», «Public domain»
  licenseUrl?: string;           // нет у CC0 и Public domain
  source: string;                // «Wikimedia Commons»
  file?: string;
}

// ── Пользователи ──────────────────────────────────────────────
type AvatarColor = "plum" | "mandarin" | "mint" | "champagne" | "rose" | "pomegranate" | "graphite" | "olive";

interface User {
  id: string;
  name: string;
  avatarColor: AvatarColor;
  birthday?: string;             // "MM-DD" (год не спрашиваем)
  interests: InterestId[];
  audience: Audience;
  isBot: boolean;
  bot?: BotProfile;
  createdAt: string;
}
interface BotProfile {
  likesCategories: (CategoryId | ActivityCategoryId)[];
  likeProbability: number;       // базовая 0..1, для любимых категорий +0.35
  speedFactor: number;           // 0.7..1.4 — у каждого бота свой темп
}

// ── Подарки и вишлист ─────────────────────────────────────────
type SwipeDecision = "like" | "superlike" | "pass";

interface ProductSwipe {
  id: string;
  userId: string;
  productId: string;
  decision: SwipeDecision;
  context: { kind: "self" } | { kind: "pick"; requestId: string };
  at: string;
}

interface WishlistItem {
  id: string;
  ownerId: string;
  source: { kind: "product"; productId: string } | { kind: "custom"; custom: CustomWish };
  priority: "normal" | "top";    // top = «Очень хочу»
  order: number;
  variantChoice?: Record<string, string>; // groupId → optionId
  note?: string;                 // ≤ 140
  status: "active" | "given";    // given = во вкладке «Подарили»
  given?: { fromUserId?: string; fromName?: string; at: string };
  addedAt: string;
}
interface CustomWish { title: string; priceMin?: number; priceMax?: number; url?: string; imageKey?: string } // imageKey → IndexedDB

interface WishlistMeta {
  ownerId: string;
  occasion?: { kind: "birthday" | "new_year" | "just_because" | "custom"; label?: string; date?: string };
  message?: string;              // ≤ 200
  hideReservationCount: boolean;
  shareUnlockedAt?: string;      // ставится на 5-м «Хочу» и больше не снимается
  dismissedGivenHintFor?: string; // дата повода, для которой владелец скрыл подсказку «Возможно, тебе подарили это»
}

interface Reservation {
  id: string;
  ownerId: string;               // чей вишлист
  itemKey: string;               // productId или "custom:<title>" — стабильно между устройствами
  reserver: { userId?: string; name: string };
  at: string;
  closedAt?: string;             // желание отмечено подаренным — бронь закрыта, гость видит «Уже подарено»
}

// Снимок чужого вишлиста, открытого по ссылке на этом устройстве
interface ExternalWishlist {
  id: string;                    // хэш содержимого ссылки
  owner: { name: string; avatarColor: AvatarColor; userId?: string };
  meta: Omit<WishlistMeta, "ownerId" | "hideReservationCount">;
  items: Array<{ key: string; productId?: string; custom?: Omit<CustomWish, "imageKey">; priority: "normal" | "top"; variantChoice?: Record<string, string>; note?: string }>;
  openedAt: string;
}

// ── «Выбери подарок сам» ──────────────────────────────────────
interface ProductFilters {
  budget: { min: number; max: number | null }; // null = без верхней границы
  categories: CategoryId[];      // пусто = все
  marketplaces: MarketplaceId[]; // пусто = все
}
interface PickRequest {
  id: string;
  from: { name: string; avatarColor: AvatarColor; userId?: string };
  toName?: string;
  filters: ProductFilters;
  hidePrices: boolean;
  occasion?: WishlistMeta["occasion"];
  message?: string;
  createdAt: string;
}
interface PickAnswer {
  requestId: string;
  by: { name: string; avatarColor: AvatarColor };
  picks: Array<{ productId: string; priority: "normal" | "top"; variantChoice?: Record<string, string> }>;
  answeredAt: string;
}

// ── «Че делать будем?» ────────────────────────────────────────
interface PlanSession {
  id: string;
  title: string;
  ownerId: string;
  mode: "live" | "deadline";
  deadline?: string;
  status: "lobby" | "swiping" | "results" | "decided";
  participantIds: string[];      // включая владельца
  readyIds: string[];            // для лобби в режиме live
  matchRule: "all" | "majority";
  filters: { categories: ActivityCategoryId[]; budgetPerPerson: { min: number; max: number | null } };
  deck: string[];                // id занятий, порядок одинаковый для всех (перемешан при старте)
  swipes: Record<string, Record<string, "like" | "pass">>; // userId → activityId → решение
  finishedIds: string[];
  votes: Record<string, string>; // userId → activityId (режим «Выбрать самим»)
  decision?: { activityId: string; method: "random" | "vote" | "owner"; decidedAt: string; scheduledFor?: string };
  createdAt: string;
}

// ── Тайный Санта ──────────────────────────────────────────────
interface SantaGame {
  id: string;
  title: string;
  ownerId: string;
  budget: number;
  exchangeDate: string;
  drawAt?: string;               // если задано — жеребьёвка автоматически в это время
  status: "gathering" | "drawn";
  participantIds: string[];
  exclusions: Array<[string, string]>; // пары, которые не дарят друг другу (в обе стороны)
  assignments?: Record<string, string>; // santaId → wardId
  openedIds: string[];           // кто уже вскрыл конверт
  boughtIds: string[];           // кто отметил «Я купил подарок»
  createdAt: string;
}
```

### База

Схема одна для обоих режимов. Где лежит:
- `local` — один ключ localStorage `swipeit:db:v1`;
- `lan` — файл `frontend/.lan-data/db.json` (в `.gitignore`), запись атомарная: во временный файл, потом переименование.

База валидируется zod-схемой при чтении. Если схема не совпала или JSON битый — база пересоздаётся из сида, пользователь видит тост «Демо-данные сброшены».

```ts
interface Db {
  version: 1;
  users: Record<string, User>;
  friends: Record<string, string[]>;          // userId → userId[] (симметрично)
  productSwipes: ProductSwipe[];
  wishlistItems: Record<string, WishlistItem[]>; // ownerId → items
  wishlistMeta: Record<string, WishlistMeta>;
  reservations: Reservation[];
  externalWishlists: Record<string, ExternalWishlist>;
  pickRequests: Record<string, PickRequest>;
  pickAnswers: PickAnswer[];
  customActivities: Record<string, Activity>;
  plans: Record<string, PlanSession>;
  santaGames: Record<string, SantaGame>;
}
```

Каталог (`products.json`, `activities.json`) **в базу не кладём**: он только для чтения и большой. Лимит localStorage — около 5 МБ. Фото своих желаний перед сохранением сжимаем до 720px по большей стороне, JPEG с качеством 0.75. В режиме `local` они лежат в IndexedDB через `idb-keyval`. В режиме `lan` загружаются на сервер (`POST /uploads` → `.lan-data/uploads/<key>.jpg`), чтобы их видели другие телефоны. При переполнении — тост «Память заполнена. Удали пару своих желаний с фото».

---

## 6. Мок-сервер

### Транспорт

```ts
// shared/api/transport.ts
export interface Transport {
  request<T>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, query?: Record<string, unknown>): Promise<T>;
}
export type ApiMode = "local" | "lan";
export function getTransport(mode: ApiMode): Transport; // выбирается один раз при запуске (см. ниже)
```

**Определение режима при запуске** (`shared/api/mode.ts`): до первого рендера данных приложение делает `GET /api/health` на своём же адресе с таймаутом 800 ms.
- Ответил `{ app: "swipeit", mode: "lan", serverId, now }` → режим `lan`, транспорт `httpTransport` на `/api/*`, шина — WebSocket.
- Не ответил (статический хостинг, `next dev`, Capacitor) → режим `local`, транспорт `mockTransport`.
- Одна и та же сборка `out/` работает в обоих режимах. Переменная `NEXT_PUBLIC_API_ORIGIN` позволяет при разработке направить `next dev` на запущенный LAN-сервер (тогда сервер отдаёт CORS-заголовки).
- Пока режим определяется — экран-заставка с бантом (не дольше 800 ms).

**Транспорты:**
- `mockTransport` сопоставляет `method + path` с обработчиком из таблицы маршрутов (`mock-server/routes.ts`), ждёт искусственную задержку **150–450 ms** (в демо-панели: «Без задержек») и возвращает **копию** данных (`structuredClone`), чтобы никто не мутировал базу по ссылке.
- `httpTransport` — `fetch` на `/api/<path>`. В режиме `lan` ходит на Node-сервер, после демо — на настоящий бэкенд без изменений. Текущий пользователь передаётся заголовком `x-user-id` (в демо без авторизации — сеть доверенная).
- Ошибки — `ApiError { status, code, message }`, коды: `NOT_FOUND`, `VALIDATION`, `CONFLICT`, `FORBIDDEN`, `STORAGE_FULL`, `OFFLINE`. В демо-панели можно включить «Случайные ошибки 10%» — чтобы показать состояния ошибок.

**Изоморфность обработчиков (обязательно с первой строки, иначе режим `lan` не собрать):**
- Обработчик — функция `(ctx, input) => Promise<output>`, где `ctx = { db: DbAccess, realtime: RealtimePublisher, clock: Clock, userId: string, random: Random, settings: DemoSettings }`.
- Внутри `mock-server/` (кроме папки `adapters/browser/`) запрещены `window`, `document`, `localStorage`, `sessionStorage`, `navigator`, `BroadcastChannel`, `fetch`, импорты из `react` и из любых слоёв выше `shared`. Проверяется правилом `no-restricted-globals` / `no-restricted-imports` в eslint для этой папки.
- Адаптеры: `adapters/browser/` (localStorage + `navigator.locks` + BroadcastChannel) и `frontend/lan/adapters/` (JSON-файл + очередь записей в памяти + WebSocket).
- Каталог тоже грузится через адаптер: в браузере `fetch("/catalog/…")`, в Node — чтение `public/catalog/*.json` с диска.
- Запросы по доменам (`shared/api/<domain>/requests.ts`) вызывают только `transport.request` — им всё равно, мок под ними или сервер. Хуки React Query лежат в `entities/*` и `features/*`, ключи — только из `query-keys.ts` (в imbir ключи строками мимо фабрики — анти-паттерн A3).

### Запись и вкладки

- Все записи в базу — через `ctx.db.write(mutator)`: прочитать → изменить → провалидировать → записать. Браузерный адаптер оборачивает это в `navigator.locks.request("swipeit-db", …)`, чтобы две вкладки не затёрли друг друга (если `navigator.locks` нет — пишем без блокировки). LAN-адаптер выполняет записи строго по очереди внутри процесса.
- После каждой записи обработчик публикует событие в шину реального времени (см. §7).

### Маршруты (они же контракт будущего REST API)

| Метод и путь | Что делает |
|---|---|
| `POST /auth/demo` | Войти как готовый демо-пользователь «Айгерим» с заполненным вишлистом |
| `POST /users` | Создать пользователя из онбординга, добавить ему демо-друзей |
| `GET /me`, `PATCH /me` | Текущий профиль (id берётся из сессии вкладки) |
| `GET /users/:id` | Профиль |
| `GET /friends` | Друзья с ближайшими днями рождения |
| `GET /catalog/feed?filters&limit=10&context` | Следующая порция ленты (алгоритм ниже) |
| `GET /catalog/count?filters` | Счётчик для кнопки «Показать N подарков» |
| `GET /catalog/products/:id` | Товар |
| `GET /catalog/meta` | `meta.json`: курсы и авторы фото занятий (для страницы «Авторы фото») |
| `POST /swipes` | Свайп `{ productId, decision, context }`. `like` и `superlike` в контексте `self` добавляют товар в вишлист. На 5-м таком лайке ставится `shareUnlockedAt`, ответ содержит `shareJustUnlocked: true` (по нему клиент запускает анимацию банта) |
| `POST /swipes/undo` | Отменить последний свайп в контексте (и убрать товар из вишлиста, если он туда попал) |
| `GET /wishlist`, `GET /users/:id/wishlist` | Свой или чужой вишлист с мета-данными. Чужой — только `active` желания. Свой — с полем `givenHints`: забронированные желания, если дата повода прошла и подсказка не скрыта |
| `PATCH /wishlist/meta` | Повод, сообщение, скрытие счётчика |
| `POST /wishlist/items` | Своё желание |
| `PATCH /wishlist/items/:id`, `DELETE /wishlist/items/:id` | Вариант, заметка, приоритет; удалить |
| `POST /wishlist/reorder` | `{ ids: string[] }` |
| `POST /wishlist/items/:id/given` | `{ fromUserId?, fromName?, at }` → `status: "given"`, брони на это желание получают `closedAt` |
| `POST /wishlist/items/:id/restore` | Вернуть из «Подарили» в вишлист (в конец списка), брони не восстанавливаются |
| `POST /wishlist/given-hint/dismiss` | Скрыть подсказку «Возможно, тебе подарили это» для текущего повода |
| `POST /wishlist/share` | Вернуть `{ url }` со снимком вишлиста: только `active` желания. Ошибка `FORBIDDEN`, если `shareUnlockedAt` ещё не стоит |
| `POST /external-wishlists` | Импортировать снимок из ссылки (на стороне гостя) |
| `GET /reservations?ownerId` | Брони вишлиста. Владельцу отдаём только количество |
| `POST /reservations`, `DELETE /reservations/:id` | Забронировать или снять бронь |
| `POST /pick-requests` | Создать ссылку-фильтр, вернуть `{ url }` |
| `POST /pick-requests/:id/answer` | Вернуть `{ url }` ссылки-ответа |
| `POST /pick-answers` | Импортировать ответ (на стороне отправителя) |
| `GET /plans`, `POST /plans`, `GET /plans/:id` | Планы |
| `POST /plans/:id/ready`, `POST /plans/:id/start` | Лобби |
| `POST /plans/:id/swipes` | `{ activityId, decision }` |
| `POST /plans/:id/finish` | Участник закончил колоду |
| `POST /plans/:id/votes` | Голос в режиме «Выбрать самим» |
| `POST /plans/:id/decide` | `{ method: "random" }` — результат выбирает **сервер** (мок), а не клиент; `{ method: "vote" \| "owner", activityId }` |
| `POST /plans/:id/decide/cancel` | Только владелец: отменить решение, статус снова `results`, событие для тоста участникам |
| `POST /activities` | Своё занятие |
| `GET /santa`, `POST /santa`, `GET /santa/:id`, `PATCH /santa/:id` | Игры; PATCH — исключения, даты, бюджет (до жеребьёвки) |
| `POST /santa/:id/join` | Вступить |
| `POST /santa/:id/draw` | Жеребьёвка (только владелец) |
| `POST /santa/:id/open`, `POST /santa/:id/bought` | Вскрыл конверт; купил подарок |
| `POST /demo/reset`, `POST /demo/scenario/new-year` | Сбросить базу; загрузить сценарий |
| `GET /demo/settings`, `PATCH /demo/settings` | Скорость ботов, смещение часов, задержки, случайные ошибки. В `local` — из стора вкладки, в `lan` — общие для сервера |
| `GET /health` | Только `lan`: `{ app: "swipeit", mode: "lan", serverId, now }` — по нему клиент узнаёт режим и сверяет часы |
| `GET /presence` | Только `lan`: кто из людей сейчас онлайн (по открытым WebSocket) |
| `POST /uploads` | Только `lan`: фото своего желания, вернуть `{ key, url }` |

### Алгоритм ленты

1. Кандидаты: каталог, отфильтрованный по `ProductFilters`, минус уже свайпнутые пользователем в этом контексте. Фильтр по бюджету: пересечение диапазонов (`priceMax ≥ budget.min && priceMin ≤ budget.max`). `audience` пользователя: показываем `all` + совпадающий.
2. Оценка: `2 × (число совпавших интересов) + popularity + случайный разброс 0..0.8`. Разброс считается от сида `userId + дата`, чтобы лента не прыгала при перезагрузке.
3. Разнообразие: не больше 2 товаров одной категории подряд.
4. Порции по 10. Клиент дозапрашивает, когда в колоде осталось 3 карточки, и заранее грузит картинки двух следующих карточек.
5. Кандидаты кончились → пустая порция → экран «Ты посмотрел всё в этих фильтрах». «Начать заново» удаляет из истории свайпы `pass` в этом контексте.

### `computeMatches(session, activities)` — чистая функция в `entities/plan`

- Для каждого занятия колоды: `likes` = сколько участников поставили `like`.
- `all` — `likes === participantIds.length`; `majority` — `likes > participantIds.length / 2`.
- Результат: `matches` (по правилу сессии) и `almost` (при правиле `all` — те, что прошли `majority`, но не `all`). Сортировка по `likes` по убыванию, затем по порядку колоды.
- Барабан крутится среди `matches`. Если их нет — среди `almost`. Если и их нет — экран «Совпадений нет» с кнопками «Считать по большинству» и «Добавить ещё занятий».

### `drawAssignments(participantIds, exclusions, random)` — чистая функция в `entities/santa-game`

- Перестановка без неподвижных точек (никто не дарит сам себе), без пар из `exclusions` (в обе стороны).
- Алгоритм: перемешать (Фишер–Йетс на `crypto.getRandomValues`), затем поиск с возвратом. Для групп до 30 человек работает мгновенно.
- Если решения нет — `ApiError CONFLICT` с понятным текстом: «Слишком много исключений: Азамату некому дарить».
- Минимум участников — 3.
- Обязательно покрыть тестами Vitest: 3–30 участников, исключения, невозможные случаи, отсутствие самоназначений (1000 прогонов).

---

## 7. Реальное время, боты, время

### Шина событий `shared/lib/realtime`

```ts
type RealtimeEvent =
  | { type: "db:changed"; scope: Array<"wishlist" | "reservations" | "plans" | "santa" | "users" | "swipes">; id?: string; by: string }
  | { type: "plan:match"; planId: string; activityId: string }
  | { type: "plan:progress"; planId: string; userId: string; done: number; total: number }
  | { type: "toast"; text: string; forUserId?: string };

interface Realtime {
  publish(e: RealtimeEvent): void;
  subscribe(handler: (e: RealtimeEvent) => void): () => void;
}
```

- Реализация в `local`: `EventTarget` внутри вкладки + `BroadcastChannel("swipeit")` между вкладками (запасной вариант — событие `storage`).
- Реализация в `lan`: WebSocket на `/ws` с автопереподключением (1 → 2 → 4 → 8 с, максимум 8). Сервер рассылает те же `RealtimeEvent` всем клиентам. После переподключения клиент инвалидирует **все** запросы React Query — мог что-то пропустить.
- В `providers.tsx` есть подписчик, который по `db:changed` инвалидирует нужные ключи React Query. Компоненты сами на шину не подписываются (кроме оверлея «Совпадение» и прогресса участников).
- Интерфейс специально такой, чтобы потом заменить реализацию на WebSocket, не трогая компоненты.

### Сессия вкладки

- Активный пользователь хранится в **`sessionStorage`** (`swipeit:session`) — у каждой вкладки свой. Новая вкладка берёт «последнего пользователя» из localStorage. Так две вкладки — два участника. В режиме `lan` «последний пользователь» — это `swipeit:lan:<serverId>:userId` (см. §7a).
- «Смотреть как» в демо-панели меняет пользователя только в текущей вкладке и сбрасывает кэш React Query.

### Боты `shared/api/mock-server/bots`

- В режиме `lan` ботов исполняет **сервер** (`BotEngine` импортируется в Node), вкладки ботов не запускают.
- В режиме `local` ботов исполняет **одна вкладка-лидер**: та, что держит `navigator.locks.request("swipeit-bots", { mode: "exclusive" }, () => new Promise(() => {}))`. Закрыли лидера — лидерство переходит другой вкладке. Без этого две вкладки удвоят действия ботов.
- Бот — обычный пользователь `isBot: true`. Действует **через те же обработчики мок-сервера**, что и люди (никаких прямых записей в базу).
- Поведение:
  - **План «Прямо сейчас»**: после `start` каждый бот-участник свайпает колоду с задержкой на карточку (скорость «Нормально»: 1–2.5 с × `speedFactor`; «Медленно» ×2; «Быстро» 0.3–0.8 с). Решение: `likeProbability` (+0.35 для любимых категорий), занятия с меткой `cheap` и любимые категории чаще. В лобби бот жмёт «Готов» через 1–4 с.
  - **План «До даты»**: боты проходят колоду в случайные моменты до дедлайна (в масштабе перемотки времени).
  - **Тайный Санта**: бот-участник вступает через 2–10 с после создания игры. Примерно у 70% ботов вишлист уже есть, остальные «собирают» его через 20–60 с. После жеребьёвки боты вскрывают конверты в течение минуты и через некоторое время отмечают «Купил».
  - **Вишлист**: через 30–90 с после того, как пользователь отправил вишлист, один-два бота-друга бронируют по подарку. Владелец видит счётчик «2 подарка уже кто-то выбрал».
- Скорость и выключение ботов — в демо-панели (`shared/store/demo-settings`, persist).

### Часы `shared/lib/clock`

- `clock.now()` = `Date.now() + offset`. Смещение хранится в demo-settings, кнопка «Перемотать на 1 день» прибавляет 24 часа.
- В режиме `lan` главные часы — на сервере. Клиент при запуске считает разницу `serverNow − Date.now()` из `/health` и прибавляет её. Смещение «перемотки» общее для всех и приходит событием `db:changed` со scope `settings`.

---

## 7a. Режим «Локальная сеть»

**Зачем:** владелец продукта тестирует фичи с живыми людьми на их телефонах — без настоящего бэкенда и без интернета.

### Запуск

```
cd frontend
npm run lan            # next build → node-сервер на 0.0.0.0:4000
npm run lan -- --reset # то же, но с чистой базой
npm run lan -- --port 4100
```

Сервер при старте печатает в терминал:
- адреса во всех локальных сетях (`os.networkInterfaces()`, только IPv4, без `127.0.0.1`), например `http://192.168.1.34:4000`;
- QR-код первого адреса (`qrcode-terminal`) — его сканируют телефоном;
- подсказку для Windows: «Если телефоны не открывают адрес — разреши Node.js в брандмауэре для частных сетей и проверь, что телефоны в той же Wi-Fi (гостевые сети часто изолируют устройства)».

### Устройство `frontend/lan/`

```
lan/
├── server.ts            ← http-сервер: /api/* → обработчики мок-сервера, /ws → WebSocket, остальное → статика из out/
├── adapters/
│   ├── file-db.ts       ← DbAccess поверх .lan-data/db.json, очередь записей
│   ├── ws-realtime.ts   ← RealtimePublisher + учёт онлайна
│   └── fs-catalog.ts    ← каталог с диска
└── tsconfig.json        ← target node, алиас @/* → ../src/* (запуск через tsx)
```

- Статика: `sirv("out", { single: false, etag: true })`. Маршруты с `trailingSlash` уже лежат как `wishlist/index.html`, ничего не переписываем.
- `/api/*`: тот же `routes.ts`, что использует `mockTransport`. Тело — JSON, ответ — JSON, ошибки — `ApiError` с HTTP-статусом.
- Пользователь запроса — заголовок `x-user-id`. Без него доступны только `/health`, `POST /users` и `POST /auth/demo`.

### Пользователи и друзья в сети

- Каждое устройство само проходит онбординг. Его `userId` хранится в localStorage под ключом `swipeit:lan:<serverId>:userId`, поэтому разные серверы не путаются. «Смотреть как» и вкладки работают как в `local` (вкладка может временно подменить `x-user-id`).
- Все люди на сервере автоматически друзья друг другу и демо-ботам. Список друзей делится на «В этой сети» (люди, с отметкой онлайн по `/presence`) и «Демо-друзья» (боты).
- Приглашения в план и Санту (`/plans/join/?id=`, `/santa/join/?id=`) в этом режиме работают на любом телефоне сети.
- Ссылки на вишлист и фильтр по-прежнему несут данные в URL. В `lan` брони гостей сохраняются на сервере, поэтому владелец видит счётчик сразу.

### Ограничения HTTP без шифрования

Адрес `http://192.168.x.x` — не «безопасный контекст» браузера. Поэтому в режиме `lan`:
- нет `navigator.share` → кнопку «Поделиться» не показываем, остаются Telegram, WhatsApp, «Скопировать», QR;
- нет `navigator.clipboard` → копирование через запасной вариант с `execCommand("copy")` (обязателен);
- нет service worker и установки PWA → не регистрируем SW в `lan`;
- `navigator.locks` не нужен — записи упорядочивает сервер;
- для id использовать `nanoid` (на `crypto.getRandomValues`, работает без HTTPS), **не** `crypto.randomUUID` (без HTTPS его нет).

### Безопасность

Сервер без авторизации и слушает всю локальную сеть. В README и в выводе терминала: «Запускай только в своей домашней или офисной Wi-Fi. В публичных сетях (кафе, коворкинг) данные увидит любой подключённый».
- Все дедлайны, обратные отсчёты, автожеребьёвка и «ближайшие дни рождения» используют только `clock.now()`.
- Планировщик проверяет дедлайны раз в 15 секунд и при возвращении во вкладку (`visibilitychange`). Наступил дедлайн → план переходит в `results`, `drawAt` наступил → жеребьёвка.

---

## 8. Ссылки и шеринг

### Кодек `shared/lib/share-codec`

- Формат: `JSON → короткие ключи → lz-string compressToEncodedURIComponent`. Конверт: `{ v: 1, k: "wl" | "pk" | "pa", d: payload }`.
- Декодирование всегда через zod-схему. Битая или чужая ссылка → экран «Ссылка повреждена. Попроси друга отправить её заново.» (не падение).
- Размер: вишлист на 30 желаний должен укладываться в ~2 000 символов URL. Тест Vitest на это обязателен.
- В ссылку не кладём фото своих желаний (только название, цену и ссылку) — у гостя вместо фото бумажная заглушка с иконкой.

| Ссылка | Маршрут | Содержимое |
|---|---|---|
| Вишлист | `/w/?d=…` | владелец (имя, цвет, birthday), повод, сообщение, желания: id товара или своё, приоритет, вариант, заметка |
| Ссылка-фильтр | `/pick/?d=…` | от кого, кому, фильтры, `hidePrices`, повод, сообщение |
| Ответ на фильтр | `/pick/answer/?d=…` | id запроса, кто ответил, выбранные товары с вариантами |
| Приглашение в план | `/plans/join/?id=…` | только id: в `local` — на этом устройстве (вкладки), в `lan` — на любом телефоне сети |
| Приглашение в Санту | `/santa/join/?id=…` | то же |

В режиме `local` приглашения в план и Санту на другом устройстве работать не могут. Если id не найден в базе, показываем экран: «В демо-версии присоединиться можно с этого же устройства или через локальную сеть. Открой ссылку в новой вкладке или посмотри, как играют демо-друзья», и кнопку «Создать свой план с демо-друзьями».

### Куда отправлять (`shared/lib/share-targets`)

- `navigator.share({ title, text, url })` — если доступно, первой кнопкой.
- Telegram: `https://t.me/share/url?url={url}&text={text}`.
- WhatsApp: `https://wa.me/?text={text}%20{url}`.
- Копировать: `navigator.clipboard.writeText`, запасной вариант — скрытое textarea + `execCommand`.
- QR: `qrcode.toString(url, { type: "svg" })` в шторке.
- Базовый адрес: `window.location.origin + basePath`.

### Календарь

`features/calendar-export` собирает `.ics` (VEVENT: название, время из `decision.scheduledFor` или ближайшая суббота 12:00, описание с участниками) и скачивает через `Blob`.

---

## 9. Состояние

- **React Query** — всё, что «с сервера» (мок): профиль, лента, вишлист, планы, игры. `staleTime` 30 секунд. Мутации — с оптимистичным обновлением там, где важна мгновенная реакция (свайп, бронь, порядок вишлиста).
- **zustand** — только клиентское:
  - `session` (`sessionStorage`): `activeUserId`;
  - `demo-settings` (`localStorage`): скорость ботов, задержки, случайные ошибки, смещение часов, режим демонстрации;
  - `gift-filters` (`localStorage`): текущие фильтры ленты;
  - локальное состояние колоды (очередь, стек отмены) — внутри `features/swipe-deck`, не в глобальном сторе.
- Данные с сервера в zustand не дублируем.
- Колода не перерисовывается на каждый кадр перетаскивания: позиция — через `useMotionValue`/`useTransform`, не через `useState`.

---

## 10. Маршруты

Все константы — в `shared/config/routes.ts`. Переход на `/` → если профиля нет, то `/onboarding/`, иначе `/gifts/`.

| Путь | Страница | Таб-бар |
|---|---|---|
| `/onboarding/` | Онбординг | нет |
| `/gifts/` | Свайп подарков | да |
| `/wishlist/` | Мой вишлист | да |
| `/w/?d=` | Чужой вишлист по ссылке | нет |
| `/pick/?d=` | «Выбери подарок сам» (друг) | нет |
| `/pick/answer/?d=` | Выбор друга (отправитель) | нет |
| `/plans/` | Список планов | да |
| `/plans/new/` | Создание | нет |
| `/plans/session/?id=` | Лобби, свайп, результаты, решено | только на результатах |
| `/plans/join/?id=` | Вступить | нет |
| `/santa/` | Список игр | да |
| `/santa/new/` | Создание | нет |
| `/santa/game/?id=` | Игра | да |
| `/santa/join/?id=` | Вступить | нет |
| `/friends/`, `/friends/profile/?id=` | Друзья | да |
| `/profile/` | Профиль | да |
| `/credits/` | Авторы фото | нет |
| `/kit/` | Витрина компонентов (только `NODE_ENV=development`) | нет |

---

## 11. PWA

- `app/manifest.ts`: `name: "SwipeIt"`, `display: "standalone"`, `background_color` и `theme_color` `#2A1024`, иконки 192, 512 и maskable 512 (бант на бархате).
- `apple-touch-icon`, `<meta name="theme-color">`, `viewport-fit=cover` для safe-area.
- Service worker (P1): кэш статики и `public/catalog/**` по схеме «сначала кэш», чтобы демо работало без интернета. Своя небольшая `public/sw.js` или Serwist, если он совместим со `output: "export"` (проверить в задаче).

---

## 12. Качество

Скрипты `package.json`: `dev`, `build`, `lan` (§7a), `lint`, `typecheck` (`tsc --noEmit`, включая `lan/`), `format`, `format:check`, `steiger` (`steiger ./src`), `test` (`vitest run`), `check` (все проверки подряд).

- `husky` pre-commit → `lint-staged` (prettier и `eslint --fix` для изменённых файлов).
- Задача считается сданной, только когда `npm run check` и `npm run build` проходят без ошибок.
- Vitest — обязательно для: `drawAssignments`, `computeMatches`, кодека ссылок, ранжирования ленты, `formatPrice`, `plural`.
- `formatPrice(min, max)` → `"2 990 – 3 600 сом"` (неразрывные пробелы ` ` в тысячах и перед «сом», узкие неразрывные ` ` вокруг тире). Округление до 10. `min === max` → `"2 990 сом"`.
- `plural(n, ["подарок", "подарка", "подарков"])` — русские правила.
- Комментарии в коде — на русском и только там, где неочевидно «почему» (как в imbir).
- Никаких `any`, `// @ts-ignore`, `eslint-disable` без комментария с причиной.

---

## 13. Публикация: GitHub и GitHub Pages

Демо публичное, чтобы владелец мог делиться ссылкой.

| Что | Значение |
|---|---|
| Репозиторий | `github.com/Seitek2002/swipeit`, **публичный**. `gh` на машине владельца авторизован под `Seitek2002` с правами `repo` и `workflow` |
| Сайт | `https://seitek2002.github.io/swipeit/` |
| Ветка | `main`; каждый push в `main` автоматически деплоит сайт |
| Способ | GitHub Actions: `actions/configure-pages` → сборка → `actions/upload-pages-artifact` (`frontend/out`) → `actions/deploy-pages`. Источник Pages — «GitHub Actions» (включается `gh api -X POST repos/Seitek2002/swipeit/pages -f build_type=workflow`) |

### Сборка под Pages
- Сайт живёт в подпапке `/swipeit`, поэтому сборка для Pages идёт с `NEXT_PUBLIC_BASE_PATH=/swipeit`. Сборка для режима `lan` и локальная — с пустым `basePath`.
- **Все** пути к своим файлам строятся через хелпер `withBasePath(path)` из `shared/lib`: каталог, картинки каталога (в JSON они от корня: `/catalog/...`), иконки, манифест, `sw.js`, ссылки для шеринга. Захардкоженный путь, начинающийся с `/`, без хелпера — баг (на Pages он ведёт на `seitek2002.github.io/catalog/...` и даёт 404).
- В `out/` должен лежать пустой файл `.nojekyll`, иначе GitHub Pages не отдаст папку `_next/`. Класть его в `public/`.
- В CI: `npm ci` → `npm run catalog:sync` → `npm run check` → `npm run build`. Если `check` упал — деплоя нет.
- `/api/health` на Pages отвечает 404 → приложение само работает в режиме `local` (так и должно быть).
- Pages — это HTTPS, поэтому системное «Поделиться», буфер обмена и service worker там работают. Манифест и service worker — со `scope` и `start_url` под `basePath`.

### Превью ссылки
Ссылкой будут делиться в Telegram и WhatsApp, поэтому в корневом `layout` — статические метатеги `og:title` («SwipeIt — свайпай подарки, которые хочешь сам»), `og:description`, `og:image` (абсолютный URL картинки 1200×630: бант на бархате и фраза из онбординга), `og:url`, `twitter:card=summary_large_image`. У ссылок с данными (`/w/?d=…`) превью то же самое: статический сайт не может собрать своё превью для каждой ссылки, это задача будущего бэкенда.

### Что попадает в публичный репозиторий
- Весь код, документы `docs/`, каталог `catalog/` вместе со скачанными фото (решение владельца от 26.11.2026: демо публичное, фото товаров ведут на магазины — риск жалобы правообладателя принят). У каждого фото есть `sourceUrl`, чтобы по жалобе быстро найти и убрать конкретное фото.
- Не попадает: `node_modules`, `.next`, `out`, `frontend/public/catalog/` (генерируется), `frontend/.lan-data/`, `.env*.local`. Секретов в проекте нет и быть не должно — перед первым push проверь `git ls-files` на что-то похожее на ключи и токены.
- `README.md` в корне репозитория: что это, ссылка на демо, 2–3 скриншота, как запустить локально и по Wi-Fi, пометка «Демо. Фото и цены товаров взяты с маркетплейсов, ссылки ведут в магазины».
