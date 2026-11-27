import { buildApp } from "./app.js";
import { ConfigError, loadConfig } from "./config.js";

// Запуск и остановка (BACKEND.md §2.3). По SIGTERM (docker stop, деплой) —
// перестаём принимать соединения и ждём начатые запросы: app.close() в
// Fastify 5 закрывает простаивающие keep-alive и дожидается активных.
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

  const app = buildApp({ config });
  await app.listen({ host: config.HOST, port: config.PORT });

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
