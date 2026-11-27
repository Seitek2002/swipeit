// Случайность для обработчиков. Через ctx.random, а не Math.random в коде:
// в тестах подставляем предсказуемый генератор, в бою — crypto.

export type Random = {
  int(maxExclusive: number): number;
  next(): number;
  pick<T>(list: readonly T[]): T;
  shuffle<T>(list: readonly T[]): T[];
};

const fromNext = (next: () => number): Random => {
  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);
  return {
    next,
    int,
    pick: <T>(list: readonly T[]) => {
      if (list.length === 0) throw new Error("pick из пустого списка");
      return list[int(list.length)] as T;
    },
    // Фишер–Йетс.
    shuffle: <T>(list: readonly T[]) => {
      const result = [...list];
      for (let i = result.length - 1; i > 0; i -= 1) {
        const j = int(i + 1);
        [result[i], result[j]] = [result[j] as T, result[i] as T];
      }
      return result;
    },
  };
};

// Честный генератор на crypto.getRandomValues: есть и в браузерах, и в Node 20+
// (и без HTTPS, в отличие от crypto.randomUUID — TECH_SPEC §7a).
export const createCryptoRandom = (): Random =>
  fromNext(() => {
    const buffer = new Uint32Array(1);
    globalThis.crypto.getRandomValues(buffer);
    return (buffer[0] ?? 0) / 2 ** 32;
  });

// Хэш строки в 32 бита (FNV-1a) — для сидов.
export const hashString = (value: string): number => {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
};

// Предсказуемый генератор mulberry32: один и тот же сид — одна и та же
// последовательность (сид демо-данных, разброс ленты по userId + дате).
export const createSeededRandom = (seed: string): Random => {
  let state = hashString(seed);
  return fromNext(() => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32;
  });
};

// Детерминированное число 0..1 по строке — без состояния.
export const seededUnit = (seed: string): number =>
  createSeededRandom(seed).next();
