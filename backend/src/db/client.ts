import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import pg from "pg";

import * as schema from "./schema";

export type Database = NodePgDatabase<typeof schema>;

export type Db = {
  db: Database;
  pool: pg.Pool;
  // Жива ли база: /v1/health отвечает 503, если нет (B03).
  ping: () => Promise<boolean>;
  close: () => Promise<void>;
};

// Пул соединений и Drizzle поверх него. Одно подключение на процесс: сервер
// и планировщик берут соединения из одного пула.
export const createDb = (url: string, max = 10): Db => {
  const pool = new pg.Pool({
    connectionString: url,
    max,
    // Пул не держит процесс живым, если сервер останавливается.
    allowExitOnIdle: true,
  });
  // Ошибка простаивающего соединения (база перезапустилась) не роняет процесс:
  // пул выбросит это соединение и возьмёт новое.
  pool.on("error", () => undefined);
  return {
    db: drizzle(pool, { schema }),
    pool,
    ping: async () => {
      try {
        await pool.query("select 1");
        return true;
      } catch {
        return false;
      }
    },
    close: () => pool.end(),
  };
};
