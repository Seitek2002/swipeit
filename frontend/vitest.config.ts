import path from "node:path";
import { defineConfig } from "vitest/config";

// Тесты чистой логики (TECH_SPEC §12) — в окружении node: мок-сервер обязан
// работать без браузера, тесты это и проверяют.
export default defineConfig({
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "lan/**/*.test.ts", "scripts/**/*.test.ts"],
  },
});
