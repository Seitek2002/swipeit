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
  {
    // Изоморфность мок-сервера (TECH_SPEC §6): те же обработчики работают в
    // браузере и в Node-сервере режима «Локальная сеть» (T12b). Браузерные
    // API, React и слои выше shared — только в adapters/browser/.
    files: ["src/shared/api/mock-server/**/*.ts"],
    ignores: ["src/shared/api/mock-server/adapters/browser/**"],
    rules: {
      "no-restricted-globals": [
        "error",
        ...[
          "window",
          "document",
          "localStorage",
          "sessionStorage",
          "navigator",
          "BroadcastChannel",
          "fetch",
          "location",
          "indexedDB",
          "XMLHttpRequest",
          "WebSocket",
        ].map((name) => ({
          name,
          message:
            "Мок-сервер изоморфный: браузерные API — только в adapters/browser/ (TECH_SPEC §6).",
        })),
      ],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-dom",
                "react/*",
                "react-dom/*",
                "next",
                "next/*",
                "zustand",
                "zustand/*",
                "@/app/*",
                "@/pages/*",
                "@/widgets/*",
                "@/features/*",
                "@/entities/*",
                "@/shared/ui",
                "@/shared/ui/*",
                "@/shared/store",
                "@/shared/store/*",
                "@/shared/lib/clock",
              ],
              message:
                "Мок-сервер изоморфный: без React, сторов и браузерных модулей — их передают адаптеры (TECH_SPEC §6).",
            },
            {
              // Типы шины (realtime/types) можно, реализации — нет.
              regex: "^@/shared/lib/realtime(/index|/local)?$",
              message:
                "Мок-сервер получает шину через ctx.realtime, а не импортом (TECH_SPEC §6).",
            },
          ],
        },
      ],
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
