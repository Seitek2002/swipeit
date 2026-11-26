import type { DbAccess } from "../../context";
import { type Db, assertValidDb, parseDb } from "../../db";
import { ApiError } from "../../errors";

type Options = {
  createInitial: () => Promise<Db>;
  key: string;
  // База была битой и пересоздана — показать тост «Демо-данные сброшены».
  onReset: () => void;
};

const LOCK_NAME = "swipeit-db";

const isQuotaError = (error: unknown) =>
  error instanceof DOMException &&
  (error.name === "QuotaExceededError" ||
    // Старый Firefox называет переполнение по-своему.
    error.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error.code === 22 ||
    error.code === 1014);

// База в localStorage (режим local, TECH_SPEC §5–6). Запись — под
// navigator.locks, чтобы две вкладки не затёрли изменения друг друга. Где
// navigator.locks нет (старый Safari, http-адрес) — пишем без блокировки.
export const createLocalStorageDb = ({
  key,
  createInitial,
  onReset,
}: Options): DbAccess => {
  const save = (db: Db) => {
    try {
      localStorage.setItem(key, JSON.stringify(db));
    } catch (error) {
      if (isQuotaError(error)) {
        throw new ApiError(
          507,
          "STORAGE_FULL",
          "Память заполнена. Удали пару своих желаний с фото",
        );
      }
      throw error;
    }
  };

  const load = async (): Promise<Db> => {
    const parsed = parseDb(localStorage.getItem(key));
    if (parsed !== null && parsed !== "broken") return parsed;
    if (parsed === "broken") {
      console.warn(
        "swipeit: база в localStorage повреждена — пересоздаю из сида",
      );
      onReset();
    }
    const fresh = await createInitial();
    save(fresh);
    return fresh;
  };

  const withLock = <T>(task: () => Promise<T>): Promise<T> =>
    typeof navigator !== "undefined" && navigator.locks
      ? (navigator.locks.request(LOCK_NAME, task) as Promise<T>)
      : task();

  return {
    // Чтение тоже под блокировкой: на пустом устройстве load() создаёт базу из
    // сида и сохраняет её — без блокировки это затёрло бы запись, сделанную
    // параллельно (GET /me и POST /users на первом запуске).
    read: () => withLock(load),
    replace: async (next) => {
      await withLock(async () => save(assertValidDb(next)));
    },
    write: <T>(mutator: (db: Db) => T) =>
      withLock(async () => {
        const db = await load();
        const result = mutator(db);
        save(assertValidDb(db));
        return result;
      }),
  };
};
