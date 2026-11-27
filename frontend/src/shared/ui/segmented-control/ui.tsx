import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

// Дженерик <T>, чтобы значения были строго типизированы (как в imbir).
export type SegmentOption<T extends string> = {
  label: ReactNode;
  value: T;
};

type Props<T extends string> = {
  className?: string;
  label: string;
  onChange: (value: T) => void;
  options: SegmentOption<T>[];
  value: T;
};

// Перенесено из imbir и перекрашено (reference.html, .seg): дорожка
// бархат-2, выбранный сегмент бархат-3 с «Бумагой», остальные — пыльная роза.
export const SegmentedControl = <T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: Props<T>) => (
  <div
    role="group"
    aria-label={label}
    className={cn("bg-velvet-2 rounded-chip flex p-1", className)}
  >
    {options.map((option) => {
      const isSelected = option.value === value;
      return (
        <button
          key={option.value}
          type="button"
          aria-pressed={isSelected}
          onClick={() => onChange(option.value)}
          className={cn(
            "text-label rounded-chip ease-out-soft relative h-9 min-w-0 flex-1 px-2 transition-[background-color,color] duration-200 before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']",
            isSelected ? "bg-velvet-3 text-paper" : "text-rose",
          )}
        >
          {/* Обрезаем подпись, а не кнопку: overflow-hidden на самой кнопке
              срезал бы псевдоэлемент, растягивающий зону нажатия до 44 px. */}
          <span className="block truncate">{option.label}</span>
        </button>
      );
    })}
  </div>
);
