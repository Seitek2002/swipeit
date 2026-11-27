import js from "@eslint/js";
import tseslint from "typescript-eslint";

// Ядро общее для браузера и Node (BACKEND.md B02): никаких React, Next и
// браузерных API — иначе backend не соберётся или поведёт себя иначе.
const BROWSER_GLOBALS = [
  "window",
  "document",
  "localStorage",
  "sessionStorage",
  "navigator",
  "location",
  "indexedDB",
  "BroadcastChannel",
].map((name) => ({
  name,
  message: "В @swipeit/core нет браузерных API: код работает и на сервере.",
}));

export default tseslint.config(
  { ignores: ["node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.strict,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "no-restricted-globals": ["error", ...BROWSER_GLOBALS],
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["react", "react-*", "next", "next/*", "@/*"],
              message:
                "В @swipeit/core нет React, Next и слоёв фронта: ядро общее с сервером.",
            },
          ],
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
