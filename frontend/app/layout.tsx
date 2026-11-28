import type { Metadata, Viewport } from "next";

import { AppFrame } from "@/app/app-frame";
import { cormorant, onest } from "@/app/fonts";
import "@/app/globals.css";
import { Preloader } from "@/app/preloader";
import { Providers } from "@/app/providers";
import { shareMetadata } from "@/app/share-metadata";

import { COLORS, SITE_DESCRIPTION, SITE_TITLE } from "@/shared/config";

// Превью ссылки в Telegram и WhatsApp (TECH_SPEC §13) — на всё приложение.
// У гостевого вишлиста /w/ и «Выбери подарок сам» /pick/ — свои (G02):
// собрать превью под каждую ссылку с данными (?d=…) статический сайт не
// может, но сказать, что это за ссылка, — может.
export const metadata: Metadata = {
  title: "SwipeIt",
  description: SITE_DESCRIPTION,
  // Установка на iOS: «На экран „Домой“» открывает без панелей Safari
  // (TECH_SPEC §11). Иконка — app/apple-icon.png.
  appleWebApp: {
    capable: true,
    title: "SwipeIt",
    statusBarStyle: "black-translucent",
  },
  ...shareMetadata({
    path: "/",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  }),
};

// viewport-fit=cover — чтобы на iPhone фон заходил под «чёлку» и полоску
// «домой», а отступы брались из env(safe-area-inset-*) (DESIGN.md §4).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: COLORS.velvet,
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ru" className={`${cormorant.variable} ${onest.variable}`}>
      <body>
        {/* Первым в body: статический прелоадер виден до загрузки JS
            (DESIGN.md §6). Закрывает и рамку телефона на десктопе. */}
        <Preloader />
        <Providers>
          <AppFrame>{children}</AppFrame>
        </Providers>
      </body>
    </html>
  );
}
