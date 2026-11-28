# SwipeIt

Мобильное веб-приложение (PWA) для Кыргызстана, цены в сомах: свайп подарков для себя → вишлист для друзей, групповой выбор занятий «Че делать будем?», Тайный Санта. Демо на GitHub Pages работает без сервера (мок-данные в localStorage); сервер для продукта — в работе (этап 9).

## Роли чатов
Роль задаётся первым сообщением в чате:
- **PM / UX-дизайнер** — пишет и меняет документы в `docs/`, принимает работу. Код не пишет.
- **Исполнитель** — пишет код в `frontend/` строго по `docs/TASKS.md` (по одной задаче), отчитывается в `docs/PROGRESS.md`.
- **Товаровед** — собирает каталог в `catalog/` по `docs/briefs/TOVAROVED.md`.

## Публикация
Публичный репозиторий `github.com/Seitek2002/swipeit`, демо — https://seitek2002.github.io/swipeit/ (GitHub Pages, деплой из GitHub Actions на каждый push в `main`).

## Документы (источник правды)
- `docs/PRD.md` — что и зачем.
- `docs/DESIGN.md` + `docs/design/reference.html` — как выглядит и двигается.
- `docs/TECH_SPEC.md` — архитектура и модель данных (контракт для фронта, каталога и будущего бэкенда).
- `docs/TASKS.md` — задачи Исполнителя; `docs/briefs/EXECUTOR.md` — его режим автономной работы.
- `docs/BACKEND.md` — ТЗ на сервер (задачи B01–B22).
- `docs/PROGRESS.md` — отчёты Исполнителя.

Образец архитектуры и стиля кода — соседний проект `../imbir-nextjs` (`docs/CODESTYLE.md`, `docs/ARCHITECTURE.md`).

## Папки
- `frontend/` — Next.js 16 (App Router, `output: "export"`), FSD в `src/`. `frontend/lan/` — Node-сервер режима «Локальная сеть» (`npm run lan`): телефоны в той же Wi-Fi работают с общими данными.
- `backend/` — сервер (Node.js, Fastify, PostgreSQL) по `docs/BACKEND.md`, этап 9. Тесты — с Postgres в Docker. Пакет для администратора серверов — `backend/deploy/`.
- `packages/core/` — общий пакет `@swipeit/core`: схемы, типы, контракт API, чистая логика. Его берут фронт, мок, LAN-сервер и backend. В корне — рабочее пространство npm, `npm run check` проверяет всё.
- `catalog/` — данные Товароведа (копируются в `frontend/public/catalog/` скриптом `catalog:sync`).
