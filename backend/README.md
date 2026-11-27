# SwipeIt — сервер

Серверная часть продукта (режим `remote`). ТЗ и задачи — [docs/BACKEND.md](../docs/BACKEND.md). Демо на GitHub Pages сервер не использует: оно работает в браузере (`local`) или с ноутбука (`npm run lan` во фронте).

Стек: Node.js 24, Fastify 5, zod 4. С задачи B03 — PostgreSQL 17 и Drizzle.

## Запуск

Зависимости ставятся из корня репозитория (рабочее пространство npm):

```bash
npm install                 # в корне swipeit/
cp backend/.env.example backend/.env   # по желанию: значения по умолчанию подходят
npm run dev -w backend      # http://localhost:4100, перезапуск при правках
curl localhost:4100/v1/health
```

Сборка и запуск собранного:

```bash
npm run build -w backend    # esbuild → backend/dist/server.js
npm run start -w backend
```

## Переменные окружения

Проверяются при старте (`src/config.ts`). Неверная — сервер не стартует и пишет, какая и почему.

| Переменная  | По умолчанию  | Что это                                    |
| ----------- | ------------- | ------------------------------------------ |
| `NODE_ENV`  | `development` | `development`, `production` или `test`     |
| `HOST`      | `0.0.0.0`     | Где слушать                                |
| `PORT`      | `4100`        | Порт                                       |
| `LOG_LEVEL` | `info`        | Уровень логов pino; `silent` — без логов   |
| `COMMIT`    | `dev`         | Коммит сборки, показывается в `/v1/health` |

Секреты (Telegram, Sentry) появятся в следующих задачах. Их значения — только в `.env` на сервере и в секретах GitHub, не в репозитории.

## База данных

Postgres для разработки и тестов — в Docker (порт только на `127.0.0.1:5433`):

```bash
docker compose -f backend/docker-compose.yml up -d
npm run db:migrate -w backend     # применить миграции к DATABASE_URL
npm run db:seed:dev -w backend    # 3 человека с вишлистами и дружбой
```

Схема — `src/db/schema.ts` (Drizzle), миграции — SQL в `src/db/migrations/`. После правки схемы:

```bash
npm run db:generate -w backend    # drizzle-kit generate → новый SQL-файл
```

Миграции после первого деплоя в prod — только добавляющие (BACKEND.md §4.2).

Тесты берут отдельную базу `swipeit_test` на том же сервере: перед прогоном она пересоздаётся с миграциями, между тестами таблицы очищаются. Адрес — `TEST_DATABASE_URL`, иначе `DATABASE_URL` с суффиксом `_test`.

## Проверки

```bash
npm run check -w backend    # typecheck, eslint, prettier, vitest
npm run check               # в корне: фронт и сервер
```

Остановка по `SIGTERM` (например, `docker stop`) не обрывает начатые запросы: сервер перестаёт принимать новые, доотвечает начатые и закрывается.
