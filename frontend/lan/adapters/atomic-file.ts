import { rename, rm, writeFile } from "node:fs/promises";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Запись «целиком или никак»: пишем во временный файл рядом и переименовываем.
// Если ноутбук выключится посреди записи, старый файл останется целым.
// На Windows rename иногда падает с EPERM/EBUSY, пока файл держит антивирус
// или индексатор, — пробуем ещё несколько раз.
export const writeFileAtomic = async (
  file: string,
  data: string | Uint8Array,
) => {
  const tmp = `${file}.${process.pid}.tmp`;
  await writeFile(tmp, data);
  for (let attempt = 0; ; attempt += 1) {
    try {
      await rename(tmp, file);
      return;
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (attempt >= 5 || (code !== "EPERM" && code !== "EBUSY")) {
        await rm(tmp, { force: true });
        throw error;
      }
      await sleep(20 * (attempt + 1));
    }
  }
};
