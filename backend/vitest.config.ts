import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const here = path.dirname(fileURLToPath(import.meta.url));

// Дни — по календарю Бишкека (BACKEND.md §2.5): так же, как у сервера.
process.env.TZ = "Asia/Bishkek";

export default defineConfig({
  resolve: {
    // Контрактные тесты (§12) гоняют и мок фронта: его модули — с алиасом @.
    alias: { "@": path.resolve(here, "../frontend/src") },
  },
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    env: { TZ: "Asia/Bishkek" },
    // Тестовая база одна на прогон: файлы — по очереди, без гонок очистки.
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
  },
});
