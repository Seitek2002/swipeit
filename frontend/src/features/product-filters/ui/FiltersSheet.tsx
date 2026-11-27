"use client";

import { useState } from "react";

import { Send } from "lucide-react";

import {
  EMPTY_FILTERS,
  type ProductFilters,
  useCatalogStores,
} from "@/entities/product";

import {
  AUDIENCES,
  AUDIENCE_LABELS,
  CATEGORY_IDS,
  CATEGORY_LABELS,
  MARKETPLACE_LABELS,
  shopLabel,
} from "@/shared/config";
import { plural } from "@/shared/lib/format";
import {
  BottomSheet,
  Button,
  Chip,
  RangeSlider,
  SegmentedControl,
} from "@/shared/ui";

import { useFilterCount } from "../model";

type Props = {
  filters: ProductFilters;
  onApply: (filters: ProductFilters) => void;
  onClose: () => void;
  // «Отправить этот фильтр другу» (DESIGN.md §8.6) — с текущим черновиком.
  onSendToFriend?: (filters: ProductFilters) => void;
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
export const FiltersSheet = ({
  open,
  filters,
  onApply,
  onClose,
  onSendToFriend,
}: Props) => {
  const [draft, setDraft] = useState(filters);
  // Открыли шторку заново — черновик из текущих фильтров.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(filters);
  }

  const count = useFilterCount(draft, { enabled: open });
  const total = count.data?.count;
  // Чипы «Магазины» — только магазины, где есть товары, под теми же именами,
  // что на карточках; «другие» — по домену (UX-аудит M1).
  const stores = useCatalogStores();
  const draftShops = draft.shops ?? [];

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
          <Button
            variant="ghost"
            disabled={!onSendToFriend || total === 0}
            onClick={() => onSendToFriend?.(draft)}
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
        {/* Переехал из бывшего онбординга (DESIGN.md §8.2): лента и так
            сдвигается к тому, что нравится, здесь — явный выбор. */}
        <div>
          <p className="text-label mb-3">Показывать подарки</p>
          <SegmentedControl
            label="Показывать подарки"
            value={draft.audience ?? "all"}
            options={AUDIENCES.map((audience) => ({
              value: audience,
              label: AUDIENCE_LABELS[audience],
            }))}
            onChange={(audience) =>
              setDraft((current) => ({
                ...current,
                audience: audience === "all" ? undefined : audience,
              }))
            }
          />
        </div>
        <div>
          <p className="text-label mb-3">Категории</p>
          <div
            role="group"
            aria-label="Категории"
            className="flex flex-wrap gap-2"
          >
            {/* Только категории с товарами (auto-tasks U09); уже выбранная
                остаётся, чтобы её можно было снять. Пока каталог не
                ответил — весь справочник. */}
            {CATEGORY_IDS.filter(
              (category) =>
                !stores.data ||
                stores.data.categories.includes(category) ||
                draft.categories.includes(category),
            ).map((category) => (
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
            {stores.data?.marketplaces.map((marketplace) => (
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
            {stores.data?.shops.map((host) => (
              <Chip
                key={host}
                selected={draftShops.includes(host)}
                onClick={() =>
                  setDraft((current) => {
                    const shops = toggle(current.shops ?? [], host);
                    return {
                      ...current,
                      shops: shops.length > 0 ? shops : undefined,
                    };
                  })
                }
              >
                {shopLabel(host)}
              </Chip>
            ))}
            {/* Старый выбор «Другой магазин» (сохранённые фильтры, ссылки) —
                виден и снимается. */}
            {draft.marketplaces.includes("other") && (
              <Chip
                selected
                onClick={() =>
                  setDraft((current) => ({
                    ...current,
                    marketplaces: current.marketplaces.filter(
                      (item) => item !== "other",
                    ),
                  }))
                }
              >
                {MARKETPLACE_LABELS.other}
              </Chip>
            )}
          </div>
        </div>
      </div>
    </BottomSheet>
  );
};
