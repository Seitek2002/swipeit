import type { Metadata, Viewport } from "next";

import { AppFrame } from "@/app/app-frame";
import { cormorant, onest } from "@/app/fonts";
import "@/app/globals.css";

import { COLORS } from "@/shared/config";

export const metadata: Metadata = {
  title: "SwipeIt",
  description:
    "Свайпай подарки, которые хочешь сам. Друзья увидят — и угадают с подарком.",
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
