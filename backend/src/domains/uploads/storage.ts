import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";

// Хранилище фото (BACKEND.md §10): диск сервера (том Docker). Интерфейс —
// чтобы позже перейти на S3-совместимое (например, Cloudflare R2).
export type PhotoStorage = {
  get: (key: string) => Promise<Buffer | null>;
  put: (key: string, data: Buffer) => Promise<void>;
};

// Ключ — nanoid(21): буквы, цифры, _ и -; ничего, что выйдет из папки.
export const PHOTO_KEY = /^[A-Za-z0-9_-]{21}$/;

export const createDiskStorage = (dir: string): PhotoStorage => {
  const fileOf = (key: string) => path.join(dir, `${key}.jpg`);
  return {
    put: async (key, data) => {
      await mkdir(dir, { recursive: true });
      // Через временный файл: оборванная запись не оставит битое фото.
      const temp = `${fileOf(key)}.${process.pid}.tmp`;
      await writeFile(temp, data);
      await rename(temp, fileOf(key));
    },
    get: async (key) =>
      PHOTO_KEY.test(key) ? readFile(fileOf(key)).catch(() => null) : null,
  };
};
