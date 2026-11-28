// Переподключение WebSocket: 1 → 2 → 4 → 8 с, дальше каждые 8 с (TECH_SPEC
// §7, BACKEND.md §5).
export const BACKOFF_MS: readonly number[] = [1000, 2000, 4000, 8000];
const LAST_DELAY_MS = 8000;

// Задержка перед попыткой attempt (с нуля). jitter — разброс в долях: 0.2 —
// ±20%. В remote он нужен, чтобы после перезапуска сервера тысячи вкладок не
// постучались в одну и ту же секунду. random — для тестов.
export const reconnectDelay = (
  attempt: number,
  jitter = 0,
  random: () => number = Math.random,
): number => {
  const index = Math.min(Math.max(attempt, 0), BACKOFF_MS.length - 1);
  const base = BACKOFF_MS[index] ?? LAST_DELAY_MS;
  return Math.round(base * (1 + jitter * (random() * 2 - 1)));
};
