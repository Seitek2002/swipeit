"use client";

import { SlidersHorizontal } from "lucide-react";

import type { ProductFilters } from "@/entities/product";

import { Chip, IconButton } from "@/shared/ui";

import { activeFilterChips, countActiveFilters } from "../model";

type RowProps = {
  filters: ProductFilters;
  // «Скрыть цены от друга»: бюджет не показываем даже чипом — цифр нет.
  hidePrices?: boolean;
  // Ссылка-фильтр от друга: фильтры видны, но менять нельзя (DESIGN.md §8.6).
  locked?: boolean;
  onChange?: (filters: ProductFilters) => void;
};

// Чипы активных фильтров над колодой, горизонтальная прокрутка (DESIGN.md §8.2).
export const ActiveFilterChips = ({
  filters,
  hidePrices = false,
  locked = false,
  onChange,
}: RowProps) => {
  const chips = activeFilterChips(filters).filter(
    (chip) => !hidePrices || chip.id !== "budget",
  );
  if (chips.length === 0) return null;
  return (
    <div className="no-scrollbar flex flex-none gap-2 overflow-x-auto px-5 pt-2 pb-1">
      {chips.map((chip) =>
        locked ? (
          <Chip key={chip.id} locked>
            {chip.label}
          </Chip>
        ) : (
          <Chip
            key={chip.id}
            onRemove={() => onChange?.(chip.remove(filters))}
            removeLabel={`Убрать фильтр «${chip.label}»`}
          >
            {chip.label}
          </Chip>
        ),
      )}
    </div>
  );
};

// Иконка фильтров в шапке с бейджем числа активных фильтров.
export const FiltersButton = ({
  filters,
  onClick,
}: {
  filters: ProductFilters;
  onClick: () => void;
}) => (
  <IconButton
    label="Фильтры"
    badge={countActiveFilters(filters)}
    onClick={onClick}
  >
    <SlidersHorizontal aria-hidden size={22} strokeWidth={1.75} />
  </IconButton>
);
