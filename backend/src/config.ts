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
});

export type Config = z.infer<typeof ConfigSchema>;

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
  return parsed.data;
};
