// Сборка сервера (BACKEND.md §2.4): esbuild → dist/server.js. Зависимости из
// package.json остаются внешними (node_modules в образе), а @swipeit/core —
// исходники TypeScript из рабочего пространства — вшиваются в сборку: Node не
// запускает .ts из node_modules.
import { build } from "esbuild";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url)),
);
const external = Object.keys(pkg.dependencies ?? {}).filter(
  (name) => name !== "@swipeit/core",
);

// Сервер и скрипты отчёта владельцу (R02): в образе их запускают так —
// docker compose exec api node dist/funnel.js --days 7.
await build({
  entryPoints: {
    server: "src/server.ts",
    funnel: "src/db/funnel-cli.ts",
    "funnel-team": "src/db/funnel-team-cli.ts",
  },
  outdir: "dist",
  bundle: true,
  platform: "node",
  target: "node24",
  format: "esm",
  sourcemap: true,
  external,
  // Зависимости core (zod, lz-string) — тоже внешние: они есть у сервера.
  plugins: [
    {
      name: "external-core-deps",
      setup(context) {
        context.onResolve({ filter: /^(zod|lz-string)(\/.*)?$/ }, (args) => ({
          path: args.path,
          external: true,
        }));
      },
    },
  ],
  logLevel: "info",
});
