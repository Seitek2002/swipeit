import path from "node:path";

import { buildApp } from "./app";
import { loadCatalog } from "./catalog/load";
import { ConfigError, loadConfig } from "./config";
import { createDb } from "./db/client";

// Запуск и остановка (BACKEND.md §2.3). По SIGTERM (docker stop, деплой) —
// перестаём принимать соединения и ждём начатые запросы.
const main = async () => {
  let config;
  try {
    config = loadConfig();
  } catch (error) {
    if (error instanceof ConfigError) {
      console.error(error.message);
      process.exit(1);
    }
    throw error;
  }
  // Часовой пояс — до первого обращения к датам (§2.5). Node подхватывает
  // TZ, заданный в процессе; в Dockerfile он стоит и снаружи.
  process.env.TZ = config.TZ;

  const db = createDb(config.DATABASE_URL, config.DATABASE_POOL_MAX);
  const bootLog = {
    warn: (details: object, message: string) =>
      console.warn(message, JSON.stringify(details)),
  };
  const catalog = await loadCatalog(
    path.resolve(process.cwd(), config.CATALOG_DIR),
    bootLog,
  );
  const app = buildApp({ config, db, catalog });
  // Пул закрывается после того, как доотвечали начатые запросы.
  app.addHook("onClose", () => db.close());
  await app.listen({ host: config.HOST, port: config.PORT });
  app.log.info(
    {
      products: catalog.products.length,
      activities: catalog.activities.length,
      catalogVersion: catalog.version,
      tz: config.TZ,
    },
    "Каталог загружен",
  );

  let closing = false;
  const shutdown = (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "Останавливаемся: ждём начатые запросы");
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error(error, "Не получилось остановиться чисто");
        process.exit(1);
      },
    );
  };
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
};

void main();
