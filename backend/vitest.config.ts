import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts", "src/**/*.test.ts"],
    environment: "node",
    // Тестовая база одна на прогон: файлы — по очереди, без гонок очистки.
    globalSetup: ["test/global-setup.ts"],
    fileParallelism: false,
  },
});
