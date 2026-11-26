# Прогресс разработки

> Сейчас: T02b — GitHub и GitHub Pages

Заполняет Исполнитель после каждой задачи из [TASKS.md](TASKS.md). Новые блоки — сверху.

## T02 — Токены, шрифты, оболочка приложения — ✅ сдано
Готово, когда:
- ✅ Все 17 маршрутов TECH_SPEC §10 открываются (dev и статическая сборка), таб-бар переключает табы и скрывается на онбординге, чужих ссылках, создании плана и игры, сессии плана, приглашениях и витрине. Аватар в шапке ведёт в профиль, «Назад» работает.
- ✅ 360, 390 и 430px — `scrollWidth` равен ширине окна на всех маршрутах; у прокручиваемой области отступ снизу 92px под плавающий таб-бар.
- ✅ Десктоп 1440px — рамка телефона 400px по центру, слева логотип-бант, фраза и QR текущего адреса с подписью «Открой на телефоне».
- ✅ Кириллица в обоих шрифтах: «Ёлка, щётка, Үй, Өрүк, Ңы» рисуется и Cormorant Garamond, и Onest (скриншот `kit-fonts.png`), запасной шрифт не нужен.

Что сделано:
- `globals.css`: токены `@theme` из DESIGN.md §2 один в один (стандартная палитра Tailwind сброшена — работают только токены), аватарные цвета, радиусы, кривые, тени бумаги; бархат (заливка + блеск + зерно), утилиты типографики `text-display` … `text-micro`, `paper`, фокус-кольцо, `prefers-reduced-motion`.
- Шрифты через `next/font/google` (`--font-cormorant`, `--font-onest` → токены `--font-display`, `--font-sans`).
- `widgets/app-shell` (во весь экран до 520px, рамка телефона шире, логотип и QR шире 960px), `widgets/tab-bar`, `widgets/app-header`, `shared/ui` (`Bow`, `Brand`, `QrCode`, `Screen`/`ScreenBody`), `shared/config/routes.ts` (+ правила таб-бара), `cn` с настроенным tailwind-merge.
- `viewport` с `viewport-fit=cover` и `theme-color`; заглушки всех экранов; `/kit/` отдаёт 404 в production-сборке.

Решения без PM:
- Шрифты подключены с поднабором `cyrillic-ext` в дополнение к `latin` и `cyrillic` из TECH_SPEC §2: только в нём лежат ү, ө, ң.
- Прокручивается не страница, а тело экрана внутри рамки: шапка и таб-бар стоят на месте одинаково на телефоне и в рамке на десктопе; шторки и тосты (T03) будут порталом в `#overlay-root` внутри рамки.
- `tailwind-merge` настроен знать утилиты типографики: иначе он считает `text-title-1` цветом и выкидывает соседний `text-paper`.
- Логотип и QR на десктопе — шире 960px; между 521 и 960px — только рамка по центру (места для колонки слева нет).
- `devIndicators: false` в `next.config.ts`: значок Next в dev лежал поверх таб-бара.
- `/` пока ведёт сразу в «Подарки»; проверка профиля → онбординг — в T05.

Каталог: Товаровед сдал партию 1 — `npm run catalog:sync` скопировал 40 подарков и 15 занятий. Проверка схемой zod и подсчёт отброшенных записей будут в T04 вместе с загрузкой каталога.

Нужна проверка владельцем на телефоне: safe-area сверху и снизу на iPhone (таблетка таб-бара над полоской «домой»).
Вопросы к PM: —
Скриншоты: docs/progress/T02/
Коммит: см. `git log` («T02: токены, шрифты, оболочка»)

## T01 — Каркас проекта — ✅ сдано
Готово, когда:
- ✅ `npm run dev` открывает страницу-заглушку (проверено curl'ом: 200 и текст «SwipeIt — скоро здесь будет демо»); `npm run build` создаёт `out/`, `npx serve out` её отдаёт (200).
- ✅ `npm run check` зелёный: typecheck (приложение и `lan/`), eslint, steiger («No problems found» на пустых слоях — отключать ничего не пришлось), prettier, vitest.
- ✅ pre-commit хук срабатывает: проверено тестовым коммитом с нарочно кривым форматированием — lint-staged переформатировал файл; тестовый коммит откатан.

Что сделано:
- `git init` в корне `swipeit/`, `.gitignore` (node_modules, .next, out, .env*.local, `frontend/.lan-data/`, `frontend/public/catalog/`).
- `frontend/`: Next.js 16.4 (App Router в корневой `app/`, FSD в `src/`), React 19.2.4, TypeScript strict + `noUncheckedIndexedAccess`, Tailwind v4, React Compiler. `next.config.ts` — как в TECH_SPEC §3 (+ `turbopack.root`, как в imbir).
- Конфиги из imbir: `eslint.config.mjs` (без их `server/**`), `.prettierrc`, `.prettierignore`, `steiger.config.ts` (только `recommended`), husky + lint-staged (prettier + `eslint --fix`).
- Все зависимости из TECH_SPEC §2 (включая `ws`, `tsx`, `sirv`, `qrcode-terminal` для T12b), vitest в окружении `node`.
- Скрипты TECH_SPEC §12 + `catalog:sync` (запускается в `predev`/`prebuild`).
- Пустые слои FSD с README, `pages/README.md`, `frontend/README.md`.

Решения без PM:
- `lan/server.ts` — заглушка с сообщением «появится в T12b» и свой `lan/tsconfig.json`, чтобы скрипты `lan` и `typecheck` (включая `lan/`) из §12 работали уже сейчас.
- В `vitest.config.ts` временно `passWithNoTests: true`: до T04 тестов нет, а vitest без тестов выходит с кодом 1. Уберу в T04.
- `catalog:sync` публикует из `../catalog/` только данные и фото (`*.json`, `products/`, `activities/`), без `REPORT.md` и скриптов Товароведа. Если подарки от Товароведа есть, а `activities.json` нет — занятия берутся из заглушки.
- Next 16.4 сам создаёт `frontend/AGENTS.md` (подсказка для ИИ-агентов про доки в `node_modules/next/dist/docs/`) — оставил в репозитории, как советует сам Next.
- npm 11 блокирует install-скрипты: разрешил `esbuild` (`allowScripts` в package.json), без него не работают tsx и vitest.

Нужна проверка владельцем на телефоне: —
Вопросы к PM:
- Во время работы обновились TASKS.md, TECH_SPEC.md и EXECUTOR.md (появились T02b и публикация на GitHub Pages). Следую новой версии.

Скриншоты: — (интерфейса ещё нет)
Коммит: см. `git log` («T01: каркас проекта»)
