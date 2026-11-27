import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

// Настройки фронта без React (BACKEND.md B01): строгий TypeScript.
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  // Скрипты сборки и конфиги — обычный Node.
  { files: ["**/*.mjs"], languageOptions: { globals: globals.node } },
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  // В тестах «!» после find() — обычное «здесь точно есть»: упадёт сам тест.
  {
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
