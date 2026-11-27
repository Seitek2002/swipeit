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

Секреты (база, Telegram, Sentry) появятся в следующих задачах. Их значения — только в `.env` на сервере и в секретах GitHub, не в репозитории.

## База данных

Postgres для разработки и тестов — в Docker:

```bash
docker compose -f backend/docker-compose.yml up -d
```

Порт открыт только на `127.0.0.1:5433`. Схема и миграции — с задачи B03.

## Проверки

```bash
npm run check -w backend    # typecheck, eslint, prettier, vitest
npm run check               # в корне: фронт и сервер
```

Остановка по `SIGTERM` (например, `docker stop`) не обрывает начатые запросы: сервер перестаёт принимать новые, доотвечает начатые и закрывается.
