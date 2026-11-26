import type { NextConfig } from "next";

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
  // Без явного root Next ищет lockfile вверх по дереву и может принять за
  // корень воркспейса домашнюю папку (так было в imbir-nextjs).
  turbopack: { root: __dirname },
};

export default nextConfig;
