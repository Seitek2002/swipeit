import { Cormorant_Garamond, Onest } from "next/font/google";

// TECH_SPEC §2: latin + cyrillic. Добавлен cyrillic-ext: в нём кыргызские
// ү, ө, ң — без него они рисовались бы запасным шрифтом (проверка T02:
// «Ёлка, щётка, Үй, Өрүк, Ңы»). Оба семейства этот поднабор поддерживают.
export const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  weight: ["500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const onest = Onest({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-onest",
  display: "swap",
});
