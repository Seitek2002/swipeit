import { Cormorant_Garamond, Onest } from "next/font/google";

// TECH_SPEC §2: latin + cyrillic + cyrillic-ext. В cyrillic-ext — кыргызские
// ү, ө, ң: без него они рисовались бы запасным шрифтом (проверка T02:
// «Ёлка, щётка, Үй, Өрүк, Ңы»).
//
// `subsets` в next/font решает только, какие файлы ПРЕДЗАГРУЖАТЬ: @font-face
// с unicode-range в CSS попадают для всех поднаборов семейства, и браузер
// сам докачает cyrillic-ext, как только на экране появится ү/ө/ң. Поэтому
// предзагружаем только то, что есть на первом экране почти любой страницы:
// latin (пробел, цифры, знаки и слово «swipeit» в логотипе) и cyrillic.
// Раньше предзагружалось 9 файлов (~250 КБ), они спорили за канал с CSS и
// JS первого экрана; кыргызские буквы в интерфейсе редки (имена, каталог).
export const cormorant = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  weight: ["500", "600", "700"],
  // Курсив нужен на первом экране: логотип «swipeit» — Cormorant italic.
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const onest = Onest({
  subsets: ["latin", "cyrillic"],
  variable: "--font-onest",
  display: "swap",
});
