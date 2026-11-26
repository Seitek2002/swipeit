import type { Metadata, Viewport } from "next";

import { AppFrame } from "@/app/app-frame";
import { cormorant, onest } from "@/app/fonts";
import "@/app/globals.css";

import {
  COLORS,
  SITE_DESCRIPTION,
  SITE_TITLE,
  SITE_URL,
} from "@/shared/config";

// Превью ссылки в Telegram и WhatsApp (TECH_SPEC §13). Статические теги на всё
// приложение: у ссылок с данными (/w/?d=…) превью то же — собрать своё превью
// под каждую ссылку статический сайт не может. Адреса абсолютные.
const OG_IMAGE = `${SITE_URL}/og.png`;

export const metadata: Metadata = {
  title: "SwipeIt",
  description: SITE_DESCRIPTION,
  openGraph: {
    type: "website",
    url: `${SITE_URL}/`,
    siteName: "SwipeIt",
    locale: "ru_RU",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Бант на бархате и фраза «Свайпай подарки, которые хочешь сам»",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
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
        <AppFrame>{children}</AppFrame>
      </body>
    </html>
  );
}
