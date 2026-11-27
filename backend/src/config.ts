import { z } from "zod";

// Переменные окружения сервера (BACKEND.md §10: секреты — только в окружении,
// в репозитории — .env.example). Неверные — сервер не стартует и пишет, что
// именно не так, а не падает потом на первом запросе.
const ConfigSchema = z.object({
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
  HOST: z.string().min(1).default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(4100),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
  // Коммит сборки — в /v1/health, чтобы видеть, что задеплоено (B18).
  COMMIT: z.string().default("dev"),
  // PostgreSQL. Для разработки — база из backend/docker-compose.yml; в
  // production обязательна явно (секрет, §10).
  DATABASE_URL: z.url({ protocol: /^postgres(ql)?$/ }).optional(),
  // Размер пула соединений.
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  // Каталог Товароведа (BACKEND.md §8): products.json, activities.json,
  // meta.json. По умолчанию — catalog/ рядом с backend/.
  CATALOG_DIR: z.string().min(1).default("../catalog"),
  // Начало коротких ссылок (BACKEND.md §6.2): url = PUBLIC_SHARE_URL/s/<код>.
  // Пока домена нет — адрес API. В production обязателен явно.
  PUBLIC_SHARE_URL: z
    .url({ protocol: /^https?$/ })
    .transform((url) => url.replace(/\/+$/, ""))
    .optional(),
  // Дни считаются по календарю Бишкека (BACKEND.md §2.5): процесс живёт в
  // этом поясе, даже если сервер в UTC.
  TZ: z.string().min(1).default("Asia/Bishkek"),
});

// База из docker-compose для разработки и тестов.
export const DEV_DATABASE_URL =
  "postgres://swipeit:swipeit@127.0.0.1:5433/swipeit";

export type Config = Omit<
  z.infer<typeof ConfigSchema>,
  "DATABASE_URL" | "PUBLIC_SHARE_URL"
> & {
  DATABASE_URL: string;
  PUBLIC_SHARE_URL: string;
};

export class ConfigError extends Error {
  override name = "ConfigError";
}

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): Config => {
  const parsed = ConfigSchema.safeParse(env);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `  ${issue.path.join(".") || "?"}: ${issue.message}`)
      .join("\n");
    throw new ConfigError(`Неверные переменные окружения:\n${details}`);
  }
  const { DATABASE_URL, PUBLIC_SHARE_URL, ...rest } = parsed.data;
  // Секрет и адрес ссылок в production — только явно, без значений для
  // разработки.
  if (rest.NODE_ENV === "production") {
    const missing = [
      ...(DATABASE_URL ? [] : ["DATABASE_URL"]),
      ...(PUBLIC_SHARE_URL ? [] : ["PUBLIC_SHARE_URL"]),
    ];
    if (missing.length > 0) {
      const details = missing
        .map((name) => `  ${name}: обязательна в production`)
        .join("\n");
      throw new ConfigError(`Неверные переменные окружения:\n${details}`);
    }
  }
  return {
    ...rest,
    DATABASE_URL: DATABASE_URL ?? DEV_DATABASE_URL,
    PUBLIC_SHARE_URL: PUBLIC_SHARE_URL ?? `http://localhost:${rest.PORT}`,
  };
};
