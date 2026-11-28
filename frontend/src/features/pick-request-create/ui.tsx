"use client";

import { type ReactNode, useRef, useState } from "react";

import { type ProductFilters, useCatalogStores } from "@/entities/product";
import { useMe } from "@/entities/user";
import {
  OccasionFields,
  occasionDraftOf,
  occasionFromDraft,
} from "@/entities/wishlist";

import { type Occasion, createPickRequest, upToGifts } from "@/shared/api";
import {
  AUDIENCES,
  AUDIENCE_LABELS,
  CATEGORY_IDS,
  CATEGORY_LABELS,
} from "@/shared/config";
import { absoluteUrl } from "@/shared/lib/dom";
import {
  BottomSheet,
  Chip,
  RangeSlider,
  SegmentedControl,
  ShareActions,
  Switch,
  TextArea,
  TextField,
} from "@/shared/ui";

import {
  PICK_LIMIT_OPTIONS,
  canHidePrices,
  effectiveHidePrices,
} from "./model";

type Props = {
  // Условия словами — их показывает экран, который открыл шторку.
  conditions: string;
  // Повод заранее — день рождения друга, если шторку открыли с его профиля
  // или из карточки «Через 5 дней у …» (auto-tasks U01). Читается при
  // монтировании, как «Кому».
  defaultOccasion?: Occasion;
  // «Кому» заполнено заранее — шторку открыли с профиля друга или из
  // баннера его дня рождения (DESIGN.md §8.6 «Где начать»). Читается при
  // монтировании: другому другу — своя шторка (key).
  defaultToName?: string;
  filters: ProductFilters;
  // Сначала имя (DESIGN.md §8.6) — форму NameSheet даёт страница
  // (features/ask-name): фичи друг друга не импортируют. Пока он есть,
  // шторка показывает его; имя сохранилось — сама переходит к ссылке.
  nameStep?: ReactNode;
  onClose: () => void;
  // Бюджет и категории можно поменять прямо в шторке (UX-аудит W02): из
  // карточки друга шторка открывается с пустыми фильтрами — «любые подарки».
  onFiltersChange?: (filters: ProductFilters) => void;
  // NAME_REQUIRED от сервера: страница спрашивает имя и повторяет отправку.
  onShareError?: (error: unknown, retry: () => void) => boolean;
  open: boolean;
};

type Input = Parameters<typeof createPickRequest>[0];

// «Отправить этот фильтр другу» (DESIGN.md §8.6): кому, повод, сообщение,
// «Скрыть цены от друга» и кнопки отправки. Ссылка создаётся при первой
// отправке; пока форма не менялась, повторные нажатия шлют ту же ссылку.
export const PickRequestSheet = ({
  open,
  onClose,
  filters,
  conditions,
  defaultToName = "",
  defaultOccasion,
  nameStep,
  onShareError,
  onFiltersChange,
}: Props) => {
  const stores = useCatalogStores();
  const { data: me } = useMe();
  const askName = Boolean(nameStep);
  const [toName, setToName] = useState(defaultToName);
  const [draft, setDraft] = useState(() => occasionDraftOf(defaultOccasion));
  const [message, setMessage] = useState("");
  const [hidePrices, setHidePrices] = useState(false);
  // «Сколько можно выбрать»: null — сколько угодно.
  const [maxPicks, setMaxPicks] = useState<null | number>(null);
  const created = useRef<{ key: string; url: Promise<string> } | null>(null);

  const getPayload = async () => {
    const input: Input = {
      filters,
      hidePrices: effectiveHidePrices(filters, hidePrices),
      maxPicks: maxPicks ?? undefined,
      toName: toName.trim() || undefined,
      occasion: occasionFromDraft(draft) ?? undefined,
      message: message.trim() || undefined,
    };
    const key = JSON.stringify(input);
    if (created.current?.key !== key) {
      const url = createPickRequest(input).then((result) => result.url);
      created.current = { key, url };
      url.catch(() => {
        if (created.current?.key === key) created.current = null;
      });
    }
    const url = await created.current.url;
    const name = me?.name?.trim() || "Друг";
    return {
      // Без рода (G07): «Выбери подарок сам» читалось бы как обращение к
      // мужчине.
      title: "Подарок на твой выбор",
      text: `${name} хочет подарить тебе подарок. Выбери, что тебе нравится`,
      url: absoluteUrl(url),
    };
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      // «Выбери подарок сам» — экран друга; отправителю — что он делает.
      title={askName ? "Как тебя зовут?" : "Предложить выбрать подарок"}
      height={askName ? "auto" : "full"}
      footer={
        askName ? undefined : (
          <ShareActions
            copyWithText
            getPayload={getPayload}
            onError={onShareError}
            qrLabel="QR-код ссылки-фильтра"
          />
        )
      }
    >
      {askName ? (
        nameStep
      ) : (
        <div className="flex flex-col gap-5 pb-2">
          <div className="paper rounded-paper shadow-paper px-4 py-3.5">
            <p className="text-caption text-ink-soft">
              {maxPicks
                ? `Друг выберет ${upToGifts(maxPicks)}`
                : "Друг выберет подарки"}
            </p>
            <p className="text-title-3 mt-0.5 italic">{conditions}</p>
          </div>
          {onFiltersChange && (
            <>
              <RangeSlider
                label="Бюджет"
                value={filters.budget}
                onChange={(budget) => onFiltersChange({ ...filters, budget })}
              />
              {/* Как в фильтрах ленты (G05): иначе подруге на день рождения
                  выпадали бритвы «для мужчин». */}
              <div>
                <p className="text-label mb-3">Показывать подарки</p>
                <SegmentedControl
                  label="Показывать подарки"
                  value={filters.audience ?? "all"}
                  options={AUDIENCES.map((audience) => ({
                    value: audience,
                    label: AUDIENCE_LABELS[audience],
                  }))}
                  onChange={(audience) =>
                    onFiltersChange({
                      ...filters,
                      audience: audience === "all" ? undefined : audience,
                    })
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
                  {CATEGORY_IDS.filter(
                    (category) =>
                      !stores.data ||
                      stores.data.categories.includes(category) ||
                      filters.categories.includes(category),
                  ).map((category) => (
                    <Chip
                      key={category}
                      selected={filters.categories.includes(category)}
                      onClick={() =>
                        onFiltersChange({
                          ...filters,
                          categories: filters.categories.includes(category)
                            ? filters.categories.filter((c) => c !== category)
                            : [...filters.categories, category],
                        })
                      }
                    >
                      {CATEGORY_LABELS[category]}
                    </Chip>
                  ))}
                </div>
              </div>
            </>
          )}
          <div>
            <p className="text-label mb-3">Сколько можно выбрать</p>
            <div
              role="group"
              aria-label="Сколько можно выбрать"
              className="flex flex-wrap gap-2"
            >
              {PICK_LIMIT_OPTIONS.map((option) => (
                <Chip
                  key={option ?? "any"}
                  selected={maxPicks === option}
                  // «3» без контекста скринридеру непонятно.
                  aria-label={option === null ? undefined : upToGifts(option)}
                  onClick={() => setMaxPicks(option)}
                >
                  {option ?? "Сколько угодно"}
                </Chip>
              ))}
            </div>
          </div>
          <TextField
            label="Кому"
            placeholder="Имя друга"
            maxLength={40}
            value={toName}
            onChange={(event) => setToName(event.target.value)}
          />
          <OccasionFields value={draft} onChange={setDraft} />
          <TextArea
            label="Сообщение"
            placeholder="Хочу порадовать тебя — выбери, что нравится"
            maxLength={200}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
          />
          <Switch
            label="Скрыть цены от друга"
            description={
              canHidePrices(filters)
                ? "Друг увидит только подарки в бюджете — без цифр"
                : "Сначала задай бюджет"
            }
            checked={effectiveHidePrices(filters, hidePrices)}
            disabled={!canHidePrices(filters)}
            onChange={setHidePrices}
          />
        </div>
      )}
    </BottomSheet>
  );
};
