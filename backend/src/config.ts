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
  // Адрес фронта продукта (с базовым путём, без «/» в конце): превью /s/:code
  // переводит туда и берёт оттуда og.png (B16).
  PUBLIC_APP_URL: z
    .url({ protocol: /^https?$/ })
    .transform((url) => url.replace(/\/+$/, ""))
    .default("http://localhost:3000"),
  // Фото (B13): папка на диске сервера (том Docker, в бэкапе).
  UPLOADS_DIR: z.string().min(1).default("data/uploads"),
  // Отчёт владельцу по HTTPS (R02): GET /v1/ops/report с этим токеном. Нет
  // переменной — маршрута как будто нет.
  OPS_TOKEN: z.string().min(24).optional(),
  // Прокси перед сервером (Cloudflare, nginx): IP — из X-Forwarded-For.
  // Значение: true или адреса прокси через запятую (как trustProxy Fastify).
  TRUST_PROXY: z.string().min(1).optional(),
  // Адреса фронта продукта и staging для CORS — точным списком через запятую.
  CORS_ORIGINS: z
    .string()
    .default("")
    .transform((value) =>
      value
        .split(",")
        .map((origin) => origin.trim().replace(/\/+$/, ""))
        .filter(Boolean),
    ),
  // Самая старая сборка фронта, с которой сервер ещё работает (B17): старее —
  // экран «Обнови приложение».
  MIN_CLIENT_BUILD: z.string().default("0"),
  // Лимиты запросов (R01) — администратор поднимет их без нового образа.
  RATE_ALL_SESSION: z.coerce.number().int().min(1).default(300),
  RATE_ALL_IP: z.coerce.number().int().min(1).default(600),
  RATE_USERS_MINUTE: z.coerce.number().int().min(1).default(20),
  RATE_USERS_HOUR: z.coerce.number().int().min(1).default(200),
  RATE_SHARE_SESSION: z.coerce.number().int().min(1).default(60),
  RATE_SHARE_IP: z.coerce.number().int().min(1).default(300),
  RATE_RESERVATIONS: z.coerce.number().int().min(1).default(30),
  RATE_FUNNEL: z.coerce.number().int().min(1).default(30),
  // Вход через Telegram (BACKEND.md §3.3, auto-tasks-pm-4 S03): Client ID бота
  // из @BotFather → Login Widget (число, не секрет). Нет переменной — входа
  // как будто нет: POST /auth/telegram и /auth/telegram/nonce отвечают 404.
  TELEGRAM_CLIENT_ID: z
    .string()
    .regex(/^\d{1,20}$/, "Client ID — число из @BotFather")
    .optional(),
  // Открытые ключи Telegram для проверки подписи id_token (кеш на час).
  TELEGRAM_JWKS_URL: z
    .url({ protocol: /^https?$/ })
    .default("https://oauth.telegram.org/.well-known/jwks.json"),
  // Лимит входа через Telegram — с IP, в минуту и в час (R01).
  RATE_TELEGRAM_MINUTE: z.coerce.number().int().min(1).default(20),
  RATE_TELEGRAM_HOUR: z.coerce.number().int().min(1).default(200),
  // Уведомления ботом (auto-tasks-pm-4 S10): токен того же бота из
  // @BotFather (секрет). Нет переменной — бот никому не пишет, сообщения
  // только в логе сервера.
  TELEGRAM_BOT_TOKEN: z
    .string()
    .regex(/^\d{1,20}:[\w-]{20,}$/, "Токен бота — «123456:ABC…» из @BotFather")
    .optional(),
  // Адрес Bot API — для подставного сервера в разработке.
  TELEGRAM_API_URL: z
    .url({ protocol: /^https?$/ })
    .transform((url) => url.replace(/\/+$/, ""))
    .default("https://api.telegram.org"),
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
  // Пустая строка — как будто переменной нет: в .env администратора строка
  // «OPS_TOKEN=» значит «не задано», а не «токен из нуля символов» (B18).
  const parsed = ConfigSchema.safeParse(
    Object.fromEntries(Object.entries(env).filter(([, value]) => value !== "")),
  );
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
