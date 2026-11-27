import type { NextConfig } from "next";

import path from "node:path";

// Конфиг — ровно из TECH_SPEC §3. Статическая сборка (`output: "export"`):
// никакого серверного кода, `next build` выдаёт папку `out/`, которую можно
// положить на GitHub Pages, в Capacitor или раздать LAN-сервером (§7a).
const nextConfig: NextConfig = {
  output: "export",
  // /wishlist/ → wishlist/index.html: статический хостинг и Capacitor отдают
  // папку с index.html, а не «файл без расширения».
  trailingSlash: true,
  images: { unoptimized: true },
  reactCompiler: true,
  // На GitHub Pages сайт живёт в подпапке /swipeit (TECH_SPEC §13). Локально и
  // в режиме «Локальная сеть» — пустой basePath.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH ?? "",
  // Корень — рабочее пространство npm (BACKEND.md §2.3): зависимости лежат в
  // ../node_modules, а позже и пакет packages/core. Явно, а не поиском
  // lockfile вверх по дереву: иначе корнем могла стать домашняя папка (так
  // было в imbir-nextjs).
  turbopack: { root: path.join(__dirname, "..") },
  // Значок Next в режиме разработки лежит в левом нижнем углу прямо поверх
  // таб-бара и мешает проверять экраны на ширине телефона.
  devIndicators: false,
};

export default nextConfig;
