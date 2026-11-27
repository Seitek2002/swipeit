import type { ReactNode } from "react";

import { Gift, Star } from "lucide-react";

import { cn } from "@/shared/lib/utils";

type Props = {
  // Подарено: приглушённая бирка без тени, вместо цены — «от Азамата, 14 марта».
  dimmed?: boolean;
  imageAlt?: string;
  imageSrc?: null | string;
  isTop?: boolean;
  // Слева — ручка перетаскивания, справа — меню ⋮.
  leading?: ReactNode;
  // Строка под названием: цена или «от кого и когда».
  meta?: ReactNode;
  note?: string;
  title: string;
  trailing?: ReactNode;
  variant?: string;
};

// Мини-бирка вишлиста (DESIGN.md §8.3, reference.html .wl-item): фото 60px,
// название в 2 строки, цена, вариант. «Очень хочу» — шампань-звезда в углу.
// Ничего не знает о каталоге: данные товара ей передают снаружи.
export const WishMiniTag = ({
  title,
  meta,
  variant,
  note,
  imageSrc,
  imageAlt = "",
  isTop = false,
  dimmed = false,
  leading,
  trailing,
}: Props) => (
  <div
    className={cn(
      "paper flex items-center gap-3 rounded-[18px] py-2.5 pr-1 pl-2",
      dimmed ? "pl-3" : "shadow-paper",
    )}
  >
    {leading}
    <div
      className={cn("relative size-[60px] flex-none", dimmed && "opacity-70")}
    >
      <div className="bg-paper-2 absolute inset-0 grid place-items-center overflow-hidden rounded-xl">
        {imageSrc ? (
          <img
            src={imageSrc}
            alt={imageAlt}
            className="size-full object-cover"
          />
        ) : (
          // Своё желание без фото — бумажная заглушка с иконкой.
          <Gift
            aria-hidden
            size={24}
            strokeWidth={1.75}
            className="text-ink-soft"
          />
        )}
      </div>
      {isTop && (
        <span
          role="img"
          aria-label="Очень хочу"
          className="bg-velvet text-champagne absolute -top-1.5 -right-1.5 z-[3] grid size-[22px] place-items-center rounded-full"
        >
          <Star
            aria-hidden
            size={13}
            strokeWidth={1.75}
            className="fill-champagne"
          />
        </span>
      )}
    </div>
    <div className={cn("min-w-0 flex-1", dimmed && "opacity-70")}>
      <p className="line-clamp-2 text-[15px] leading-5 font-semibold">
        {title}
      </p>
      {meta && <div className="mt-0.5 text-[15px] leading-5">{meta}</div>}
      {variant && <p className="text-caption text-ink-soft mt-px">{variant}</p>}
      {note && (
        <p className="text-caption text-ink-soft mt-px line-clamp-1 italic">
          «{note}»
        </p>
      )}
    </div>
    {trailing}
  </div>
);
