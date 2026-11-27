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
});

// База из docker-compose для разработки и тестов.
export const DEV_DATABASE_URL =
  "postgres://swipeit:swipeit@127.0.0.1:5433/swipeit";

export type Config = Omit<z.infer<typeof ConfigSchema>, "DATABASE_URL"> & {
  DATABASE_URL: string;
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
  const { DATABASE_URL, ...rest } = parsed.data;
  if (!DATABASE_URL && rest.NODE_ENV === "production") {
    throw new ConfigError(
      "Неверные переменные окружения:\n  DATABASE_URL: обязательна в production",
    );
  }
  return { ...rest, DATABASE_URL: DATABASE_URL ?? DEV_DATABASE_URL };
};
