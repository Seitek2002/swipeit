import { loadConfig } from "../src/config";

// Конфиг тестов: тихий лог и высокие лимиты запросов — тесты создают
// десятки профилей с одного адреса на стоящих часах. Сами лимиты (R01)
// проверяет limits.test.ts со значениями по умолчанию.
export const testConfig = (env: Record<string, string> = {}) =>
  loadConfig({
    LOG_LEVEL: "silent",
    RATE_ALL_SESSION: "1000000",
    RATE_ALL_IP: "1000000",
    RATE_USERS_MINUTE: "1000000",
    RATE_USERS_HOUR: "1000000",
    RATE_SHARE_SESSION: "1000000",
    RATE_SHARE_IP: "1000000",
    RATE_RESERVATIONS: "1000000",
    RATE_FUNNEL: "1000000",
    ...env,
  });
