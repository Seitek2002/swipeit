import type { Metadata } from "next";

import { SITE_URL } from "@/shared/config";

// Превью ссылки в Telegram и WhatsApp (TECH_SPEC §13): Open Graph и карточка
// Twitter. Next не сливает openGraph страницы с openGraph корня — страница
// со своим превью отдаёт весь набор, поэтому он собирается здесь. Адреса
// абсолютные: превью строится на серверах мессенджера.
const OG_IMAGE = `${SITE_URL}/og.png`;

export const shareMetadata = ({
  description,
  path,
  title,
}: {
  description: string;
  // Путь страницы со слешем в конце (trailingSlash), например "/w/".
  path: string;
  title: string;
}): Pick<Metadata, "openGraph" | "twitter"> => ({
  openGraph: {
    type: "website",
    // Свой путь страницы, а не корень (UX-аудит G02).
    url: `${SITE_URL}${path}`,
    siteName: "SwipeIt",
    locale: "ru_RU",
    title,
    description,
    images: [
      {
        url: OG_IMAGE,
        width: 1200,
        height: 630,
        alt: "Бант на бархате и фраза «Свайпай подарки, которые хочется тебе»",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title,
    description,
    images: [OG_IMAGE],
  },
});
