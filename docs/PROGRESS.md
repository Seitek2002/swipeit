# Прогресс разработки

> Сейчас: T02 — Токены, шрифты, оболочка приложения

Заполняет Исполнитель после каждой задачи из [TASKS.md](TASKS.md). Новые блоки — сверху.

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
