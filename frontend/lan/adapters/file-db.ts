import { copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";

import type { DbAccess } from "@/shared/api/mock-server/context";
import { type Db, assertValidDb, parseDb } from "@/shared/api/mock-server/db";

import { writeFileAtomic } from "./atomic-file";

// Как база оказалась в памяти при старте — сервер печатает это в терминал.
export type DbOrigin = "broken" | "created" | "loaded";

type Options = {
  createInitial: () => Promise<Db>;
  file: string;
  log?: (line: string) => void;
};

export type FileDb = DbAccess & {
  // Дождаться всех начатых записей (перед выходом).
  flush(): Promise<void>;
  // Загрузить базу заранее, чтобы сказать в терминале, новая она или нет.
  init(): Promise<DbOrigin>;
};

// База режима lan (TECH_SPEC §7a): JSON-файл .lan-data/db.json и копия в
// памяти. Сервер — единственный процесс, который её пишет, поэтому
// блокировки не нужны: хватает очереди записей внутри процесса.
export const createFileDb = ({
  file,
  createInitial,
  log = console.log,
}: Options): FileDb => {
  let current: Db | null = null;
  let loading: null | Promise<DbOrigin> = null;
  let queue: Promise<unknown> = Promise.resolve();

  const persist = async (db: Db) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFileAtomic(file, JSON.stringify(db));
  };

  const readRaw = async (): Promise<null | string> => {
    try {
      return await readFile(file, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  };

  const load = async (): Promise<DbOrigin> => {
    const parsed = parseDb(await readRaw());
    if (parsed !== null && parsed !== "broken") {
      current = parsed;
      return "loaded";
    }
    if (parsed === "broken") {
      // Битый файл не выбрасываем молча: копия рядом — вдруг понадобится.
      const backup = `${file}.broken-${Date.now()}`;
      await copyFile(file, backup).catch(() => undefined);
      log(
        `База ${path.basename(file)} повреждена — копия в ${path.basename(backup)}, создаю новую из демо-данных`,
      );
    }
    const fresh = assertValidDb(await createInitial());
    await persist(fresh);
    current = fresh;
    return parsed === "broken" ? "broken" : "created";
  };

  const ensure = async (): Promise<Db> => {
    loading ??= load().catch((error: unknown) => {
      loading = null;
      throw error;
    });
    await loading;
    return current as Db;
  };

  // Всё, что меняет базу, — по одной в очереди. Сначала файл, потом память:
  // не записалось на диск — база в памяти тоже прежняя, запрос получит ошибку.
  const enqueue = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task);
    queue = run.catch(() => undefined);
    return run;
  };

  return {
    init: async () => {
      await ensure();
      return (await loading) as DbOrigin;
    },
    // Копия: обработчик не должен менять базу по ссылке мимо write().
    read: async () => structuredClone(await ensure()),
    replace: (next) =>
      enqueue(async () => {
        await ensure();
        const valid = assertValidDb(structuredClone(next));
        await persist(valid);
        current = valid;
      }),
    write: <T>(mutator: (db: Db) => T) =>
      enqueue(async () => {
        const draft = structuredClone(await ensure());
        const result = mutator(draft);
        const valid = assertValidDb(draft);
        await persist(valid);
        current = valid;
        return result;
      }),
    flush: async () => {
      await queue;
    },
  };
};
