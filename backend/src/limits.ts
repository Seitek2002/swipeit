// Лимиты запросов (BACKEND.md §10, B17; auto-tasks-pm-3 R01). В памяти
// процесса, скользящее окно. Ключ — сессия, если токен верный, иначе IP:
// офис выходит в интернет с одного адреса, а у мобильных операторов один
// адрес на тысячи абонентов (CGNAT) — лимит по IP уронил бы 21-го коллегу.

export type Rule = { limit: number; windowMs: number };

export type LimitConfig = {
  // Все запросы.
  allIp: Rule;
  allSession: Rule;
  // Шаги воронки клиента (R09) — на сессию.
  funnel: Rule;
  // Брони — на человека.
  reservations: Rule;
  // GET /share/:code (и /s/:code — B16).
  shareIp: Rule;
  shareSession: Rule;
  // Вход через Telegram (S03) — всегда с IP, у nonce и входа свои счётчики.
  telegramIpHour: Rule;
  telegramIpMinute: Rule;
  // POST /users — профиль без токена, защита от «фермы» профилей.
  usersIpHour: Rule;
  usersIpMinute: Rule;
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

export const limitConfigFrom = (env: {
  RATE_FUNNEL: number;
  RATE_ALL_IP: number;
  RATE_ALL_SESSION: number;
  RATE_RESERVATIONS: number;
  RATE_SHARE_IP: number;
  RATE_SHARE_SESSION: number;
  RATE_TELEGRAM_HOUR: number;
  RATE_TELEGRAM_MINUTE: number;
  RATE_USERS_HOUR: number;
  RATE_USERS_MINUTE: number;
}): LimitConfig => ({
  allSession: { limit: env.RATE_ALL_SESSION, windowMs: MINUTE },
  allIp: { limit: env.RATE_ALL_IP, windowMs: MINUTE },
  usersIpMinute: { limit: env.RATE_USERS_MINUTE, windowMs: MINUTE },
  usersIpHour: { limit: env.RATE_USERS_HOUR, windowMs: HOUR },
  shareSession: { limit: env.RATE_SHARE_SESSION, windowMs: MINUTE },
  shareIp: { limit: env.RATE_SHARE_IP, windowMs: MINUTE },
  reservations: { limit: env.RATE_RESERVATIONS, windowMs: MINUTE },
  funnel: { limit: env.RATE_FUNNEL, windowMs: MINUTE },
  telegramIpMinute: { limit: env.RATE_TELEGRAM_MINUTE, windowMs: MINUTE },
  telegramIpHour: { limit: env.RATE_TELEGRAM_HOUR, windowMs: HOUR },
});

// Правила, которые считают по IP даже с верным токеном (S03: «20 в минуту и
// 200 в час с IP»).
export const BY_IP_RULES: ReadonlySet<string> = new Set([
  "telegram-minute",
  "telegram-hour",
  "telegram-nonce-minute",
  "telegram-nonce-hour",
]);

export type Limiter = {
  // Засчитать попадание; не прошло — через сколько секунд можно снова.
  hit: (key: string, rule: Rule) => null | number;
};

export const createLimiter = (now: () => number): Limiter => {
  const hits = new Map<string, number[]>();
  let lastSweep = now();
  return {
    hit: (key, rule) => {
      const at = now();
      // Раз в минуту выбрасываем пустые ключи — память не растёт.
      if (at - lastSweep > MINUTE) {
        lastSweep = at;
        for (const [name, list] of hits) {
          if (list.every((t) => at - t > HOUR)) hits.delete(name);
        }
      }
      const fresh = (hits.get(key) ?? []).filter((t) => at - t < rule.windowMs);
      if (fresh.length >= rule.limit) {
        hits.set(key, fresh);
        const oldest = fresh[0] ?? at;
        return Math.max(1, Math.ceil((oldest + rule.windowMs - at) / 1000));
      }
      fresh.push(at);
      hits.set(key, fresh);
      return null;
    },
  };
};

// Какие правила у маршрута контракта: всегда «все запросы» и особые.
export const rulesFor = (
  routeKey: string,
  hasSession: boolean,
  config: LimitConfig,
): Array<{ name: string; rule: Rule }> => {
  const rules = [
    hasSession
      ? { name: "all", rule: config.allSession }
      : { name: "all", rule: config.allIp },
  ];
  if (routeKey === "POST /users" && !hasSession) {
    rules.push(
      { name: "users-minute", rule: config.usersIpMinute },
      { name: "users-hour", rule: config.usersIpHour },
    );
  }
  if (routeKey === "GET /share/:code") {
    rules.push(
      hasSession
        ? { name: "share", rule: config.shareSession }
        : { name: "share", rule: config.shareIp },
    );
  }
  if (routeKey === "POST /auth/telegram") {
    rules.push(
      { name: "telegram-minute", rule: config.telegramIpMinute },
      { name: "telegram-hour", rule: config.telegramIpHour },
    );
  }
  if (routeKey === "POST /auth/telegram/nonce") {
    rules.push(
      { name: "telegram-nonce-minute", rule: config.telegramIpMinute },
      { name: "telegram-nonce-hour", rule: config.telegramIpHour },
    );
  }
  if (routeKey === "POST /me/funnel" && hasSession) {
    rules.push({ name: "funnel", rule: config.funnel });
  }
  if (routeKey === "POST /reservations" && hasSession) {
    rules.push({ name: "reservations", rule: config.reservations });
  }
  return rules;
};
