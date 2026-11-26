"use client";

import { useState } from "react";

import { Send } from "lucide-react";

import { EMPTY_FILTERS, type ProductFilters } from "@/entities/product";

import {
  CATEGORY_IDS,
  CATEGORY_LABELS,
  MARKETPLACE_IDS,
  MARKETPLACE_LABELS,
} from "@/shared/config";
import { plural } from "@/shared/lib/format";
import { BottomSheet, Button, Chip, RangeSlider } from "@/shared/ui";

import { useFilterCount } from "../model";

type Props = {
  filters: ProductFilters;
  onApply: (filters: ProductFilters) => void;
  onClose: () => void;
  open: boolean;
};

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

// Шторка фильтров (DESIGN.md §8.2): бюджет, категории, магазины, живой
// счётчик на кнопке, «Сбросить». Фильтры применяются кнопкой, а не на лету —
// колода не перетасовывается, пока человек выбирает.
export const FiltersSheet = ({ open, filters, onApply, onClose }: Props) => {
  const [draft, setDraft] = useState(filters);
  // Открыли шторку заново — черновик из текущих фильтров.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(filters);
  }

  const count = useFilterCount(draft, { enabled: open });
  const total = count.data?.count;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title="Фильтры"
      height="full"
      headerExtra={
        <Button
          size="sm"
          variant="ghost"
          onClick={() => setDraft(EMPTY_FILTERS)}
        >
          Сбросить
        </Button>
      }
      footer={
        <>
          <Button
            size="lg"
            disabled={total === 0}
            loading={total === undefined}
            onClick={() => onApply(draft)}
          >
            {total === 0
              ? "В этих рамках подарков нет"
              : `Показать ${total ?? ""} ${plural(total ?? 0, ["подарок", "подарка", "подарков"])}`}
          </Button>
          {/* «Выбери подарок сам» — в T10. */}
          <Button
            variant="ghost"
            disabled
            icon={<Send aria-hidden size={18} strokeWidth={1.75} />}
          >
            Отправить этот фильтр другу
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-[26px] pb-2">
        <RangeSlider
          label="Бюджет"
          value={draft.budget}
          onChange={(budget) => setDraft((current) => ({ ...current, budget }))}
        />
        <div>
          <p className="text-label mb-3">Категории</p>
          <div
            role="group"
            aria-label="Категории"
            className="flex flex-wrap gap-2"
          >
            {CATEGORY_IDS.map((category) => (
              <Chip
                key={category}
                selected={draft.categories.includes(category)}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    categories: toggle(current.categories, category),
                  }))
                }
              >
                {CATEGORY_LABELS[category]}
              </Chip>
            ))}
          </div>
        </div>
        <div>
          <p className="text-label mb-3">Магазины</p>
          <div
            role="group"
            aria-label="Магазины"
            className="flex flex-wrap gap-2"
          >
            {MARKETPLACE_IDS.map((marketplace) => (
              <Chip
                key={marketplace}
                selected={draft.marketplaces.includes(marketplace)}
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    marketplaces: toggle(current.marketplaces, marketplace),
                  }))
                }
              >
                {MARKETPLACE_LABELS[marketplace]}
              </Chip>
            ))}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};
