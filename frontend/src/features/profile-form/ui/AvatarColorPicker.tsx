"use client";

import { AVATAR_COLORS, type AvatarColor } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Avatar } from "@/shared/ui";

const COLOR_LABELS: Record<AvatarColor, string> = {
  plum: "Слива",
  mandarin: "Мандарин",
  mint: "Мята",
  champagne: "Шампань",
  rose: "Роза",
  pomegranate: "Гранат",
  graphite: "Графит",
  olive: "Олива",
};

type Props = {
  name: string;
  onChange: (color: AvatarColor) => void;
  value: AvatarColor;
};

// Выбор «тканевого» фона аватара (DESIGN.md §8.1): 8 кружков с первой буквой
// имени. Выбранный — кольцо «Бумаги» с зазором.
export const AvatarColorPicker = ({ name, value, onChange }: Props) => (
  <div
    role="radiogroup"
    aria-label="Цвет аватара"
    className="flex flex-wrap gap-2"
  >
    {AVATAR_COLORS.map((color) => {
      const isSelected = color === value;
      return (
        <button
          key={color}
          type="button"
          role="radio"
          aria-checked={isSelected}
          aria-label={COLOR_LABELS[color]}
          onClick={() => onChange(color)}
          className="grid size-11 place-items-center rounded-full"
        >
          <Avatar
            name={name}
            color={color}
            size={36}
            decorative
            className={cn(
              "ease-out-soft transition-shadow duration-200",
              isSelected &&
                "shadow-[0_0_0_2px_var(--color-velvet),0_0_0_4px_var(--color-paper)]",
            )}
          />
        </button>
      );
    })}
  </div>
);
