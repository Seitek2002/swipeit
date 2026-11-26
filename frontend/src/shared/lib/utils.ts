import { type ClassValue, clsx } from "clsx";
import { extendTailwindMerge } from "tailwind-merge";

// Типографика DESIGN.md §3 объявлена как утилиты `text-display` … `text-micro`
// (globals.css). Без этой настройки tailwind-merge принимает их за цвет текста
// (в v3 любой `text-*` подходит под цвет) и молча выкидывает соседний
// `text-paper` или `text-ink` — текст становится не того цвета.
const twMerge = extendTailwindMerge({
  extend: {
    classGroups: {
      "font-size": [
        {
          text: [
            "display",
            "title-1",
            "title-2",
            "title-3",
            "body-lg",
            "body",
            "label",
            "price",
            "caption",
            "micro",
          ],
        },
      ],
    },
  },
});

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
