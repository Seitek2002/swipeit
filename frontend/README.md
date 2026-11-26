# SwipeIt — фронтенд (демо)

Next.js 16 (App Router, статическая сборка `output: "export"`) + TypeScript +
Tailwind v4 + zustand + TanStack Query, архитектура FSD. Сервера нет: данные
живут в мок-сервере поверх localStorage.

## Запуск

```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run build        # статическая сборка в out/
npx serve out        # посмотреть сборку
```

## Команды

| Команда                                                            | Что делает                                                                     |
| ------------------------------------------------------------------ | ------------------------------------------------------------------------------ |
| `npm run dev`                                                      | Режим разработки (перед стартом копирует каталог)                              |
| `npm run build`                                                    | Статическая сборка в `out/`                                                    |
| `npm run lan`                                                      | Сервер режима «Локальная сеть» для теста с друзьями по Wi-Fi (появится в T12b) |
| `npm run catalog:sync`                                             | Копирует `../catalog/` (или заглушку `catalog-stub/`) в `public/catalog/`      |
| `npm run check`                                                    | Все проверки: типы, eslint, steiger, prettier, тесты                           |
| `npm run typecheck` / `lint` / `steiger` / `format:check` / `test` | По отдельности                                                                 |
| `npm run format`                                                   | Отформатировать всё prettier'ом                                                |

Перед коммитом хук husky прогоняет prettier и `eslint --fix` по изменённым файлам.

## Структура

```
frontend/
├── app/            ← только роутинг Next (тонкие page.tsx / layout.tsx)
├── pages/          ← пустая заглушка, см. pages/README.md
├── src/            ← FSD: app → pages → widgets → features → entities → shared
├── lan/            ← Node-сервер режима «Локальная сеть»
├── catalog-stub/   ← каталог-заглушка до прихода данных Товароведа
└── scripts/        ← служебные скрипты (catalog-sync и др.)
```

## Документация

Всё в `../docs/`: [PRD](../docs/PRD.md) — что и зачем,
[DESIGN](../docs/DESIGN.md) и [reference.html](../docs/design/reference.html) —
как выглядит, [TECH_SPEC](../docs/TECH_SPEC.md) — архитектура и модель данных,
[TASKS](../docs/TASKS.md) — задачи, [PROGRESS](../docs/PROGRESS.md) — отчёты.
