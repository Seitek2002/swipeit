import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import perfectionist from "eslint-plugin-perfectionist";
import { defineConfig, globalIgnores } from "eslint/config";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: ["**/*.{ts,tsx}"],
    plugins: { perfectionist },
    // Как в imbir-nextjs: только type-level сортировка. Она стирается при
    // компиляции, поэтому на рантайм повлиять не может.
    //
    // sort-imports НЕ включаем: импорты расставляет
    // @trivago/prettier-plugin-sort-imports (см. .prettierrc), два
    // сортировщика подрались бы за один и тот же блок.
    //
    // Всё на warn: это подсказка при чтении типа, а не повод ронять CI.
    rules: {
      "perfectionist/sort-enums": ["warn", { type: "alphabetical" }],
      "perfectionist/sort-interfaces": ["warn", { type: "alphabetical" }],
      "perfectionist/sort-object-types": ["warn", { type: "alphabetical" }],
      "perfectionist/sort-union-types": ["warn", { type: "alphabetical" }],
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Копия каталога (генерируется скриптом catalog:sync) и данные LAN-сервера.
    "public/**",
    ".lan-data/**",
  ]),
]);

export default eslintConfig;
