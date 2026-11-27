import { Cormorant_Garamond, Onest } from "next/font/google";

// TECH_SPEC §2: latin + cyrillic + cyrillic-ext. В cyrillic-ext — кыргызские
// ү, ө, ң: без него они рисовались бы запасным шрифтом (проверка T02:
// «Ёлка, щётка, Үй, Өрүк, Ңы»).
//
// `subsets` в next/font решает только, какие файлы ПРЕДЗАГРУЖАТЬ: @font-face
// с unicode-range в CSS попадают для всех поднаборов семейства, и браузер
// сам докачает cyrillic-ext, как только на экране появится ү/ө/ң. Поэтому
// предзагружаем только cyrillic — основной текст любого экрана. latin
// (цифры, знаки, «swipeit» в логотипе) браузер докачает по unicode-range,
// как только он понадобится. Раньше предзагружалось 9, потом 6 файлов: они
// спорили за канал с JS первого экрана и тянули вниз LCP в Lighthouse (T20).
export const cormorant = Cormorant_Garamond({
  subsets: ["cyrillic"],
  weight: ["500", "600", "700"],
  // Курсив нужен на первом экране: логотип «swipeit» — Cormorant italic.
  style: ["normal", "italic"],
  variable: "--font-cormorant",
  display: "swap",
});

export const onest = Onest({
  subsets: ["cyrillic"],
  variable: "--font-onest",
  display: "swap",
});
