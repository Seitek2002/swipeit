// Когда убирать прелоадер (DESIGN.md §6 «Прелоадер»). Чистая логика без
// window: время, таймеры, хранилище и узел подставляются — так её проверяют
// тесты, а в браузере работает экземпляр из ./index.ts.

// При самом первом открытии хореография доигрывает целиком.
export const MIN_FIRST_OPEN_MS = 1100;
// Дольше не держим: экран сам покажет скелетоны или ошибку.
export const MAX_SHOW_MS = 4000;
export const FADE_MS = 300;
// Удержания экранов ставятся в эффектах после готовности приложения: проверку
// откладываем на пару кадров, чтобы экран успел сказать «подожди меня».
export const SETTLE_MS = 50;

export type PreloaderEnv = {
  clearTimer: (id: unknown) => void;
  // Прелоадер уже показывался на этом устройстве.
  markSeen: () => void;
  // Время с начала загрузки страницы (performance.now()).
  now: () => number;
  // Плавно скрыть узел и удалить его после исчезновения.
  removeNode: () => void;
  seenBefore: boolean;
  setTimer: (callback: () => void, ms: number) => unknown;
};

export const createPreloaderController = (env: PreloaderEnv) => {
  const holds = new Set<string>();
  let appReady = false;
  let hidden = false;
  let check: unknown = null;

  const hide = () => {
    if (hidden) return;
    hidden = true;
    holds.clear();
    if (check !== null) env.clearTimer(check);
    env.markSeen();
    env.removeNode();
  };

  const evaluate = () => {
    check = null;
    if (hidden || !appReady || holds.size > 0) return;
    const wait = (env.seenBefore ? 0 : MIN_FIRST_OPEN_MS) - env.now();
    if (wait > 0) {
      check = env.setTimer(evaluate, wait);
      return;
    }
    hide();
  };

  const schedule = () => {
    if (hidden) return;
    if (check !== null) env.clearTimer(check);
    check = env.setTimer(evaluate, SETTLE_MS);
  };

  env.setTimer(hide, Math.max(0, MAX_SHOW_MS - env.now()));

  return {
    // Приложение запустилось — или не смогло: ошибку тоже надо показать.
    appSettled: () => {
      appReady = true;
      schedule();
    },
    hold: (key: string) => {
      if (hidden) return;
      holds.add(key);
    },
    isHidden: () => hidden,
    release: (key: string) => {
      if (!holds.delete(key)) return;
      schedule();
    },
  };
};

export type PreloaderController = ReturnType<typeof createPreloaderController>;
