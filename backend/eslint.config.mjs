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
  // Время в обработчиках — только ctx.clock (BACKEND.md §2.5): в тестах часы
  // подставные, а Date.now() их обошёл бы.
  {
    files: ["src/domains/**/*.ts", "src/auth/**/*.ts"],
    rules: {
      "no-restricted-properties": [
        "error",
        {
          object: "Date",
          property: "now",
          message: "Время — только через ctx.clock.now().",
        },
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector: "NewExpression[callee.name='Date'][arguments.length=0]",
          message: "Время — только через ctx.clock.now().",
        },
      ],
    },
  },
  // В тестах «!» после find() — обычное «здесь точно есть»: упадёт сам тест.
  {
    files: ["**/*.test.ts"],
    rules: { "@typescript-eslint/no-non-null-assertion": "off" },
  },
);
