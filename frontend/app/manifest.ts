import type { MetadataRoute } from "next";

import { BASE_PATH } from "@/shared/lib/base-path";

// Статический экспорт: манифест собирается один раз при сборке.
export const dynamic = "force-static";

// Манифест PWA (TECH_SPEC §11). Пути — с basePath: на GitHub Pages
// приложение живёт в /swipeit/, и scope/start_url без него не совпали бы
// со страницами.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SwipeIt",
    short_name: "SwipeIt",
    description:
      "Свайпай подарки, которые хочешь сам, — друзья угадают с подарком. Планы с друзьями и Тайный Санта.",
    lang: "ru",
    start_url: `${BASE_PATH}/`,
    scope: `${BASE_PATH}/`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#2A1024",
    theme_color: "#2A1024",
    icons: [
      {
        src: `${BASE_PATH}/icons/icon-192.png`,
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${BASE_PATH}/icons/icon-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: `${BASE_PATH}/icons/icon-maskable-512.png`,
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
