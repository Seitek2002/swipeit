"use client";

import { useState } from "react";

import Link from "next/link";

import { AppHeader } from "@/widgets/app-header";
import { GiftDeck, GiftDeckSkeleton } from "@/widgets/gift-deck";

import { NAME_CAPTIONS, NameForm, useRequireName } from "@/features/ask-name";
import { PickRequestSheet } from "@/features/pick-request-create";
import {
  ActiveFilterChips,
  FiltersButton,
  FiltersSheet,
  describeFilters,
} from "@/features/product-filters";

import { EMPTY_FILTERS, type ProductFilters } from "@/entities/product";
import { useWishlistSummary } from "@/entities/wishlist";

import { ROUTES } from "@/shared/config";
import { useGiftFiltersStore } from "@/shared/store";
import { Bow, Screen } from "@/shared/ui";

// После открытия шеринга лента прогресса превращается в маленький бант-кнопку
// «Отправить» в шапке (DESIGN.md §7 WishRibbon).
const SendWishlistChip = () => (
  <Link
    href={ROUTES.WISHLIST}
    className="bg-velvet-2 border-line text-paper rounded-chip relative mr-1 inline-flex h-9 items-center gap-1.5 border pr-3 pl-2 text-[13px] leading-none font-semibold before:absolute before:-inset-x-1 before:-inset-y-1.5 before:content-[''] max-[379px]:px-2.5"
  >
    <Bow className="h-[18px] w-[26px]" />
    {/* На 360px заголовку «Подарки» не хватает места — остаётся бант,
        а «Отправить» читает только скринридер. */}
    <span className="max-[379px]:sr-only">Отправить</span>
  </Link>
);

// Экран «Подарки» (DESIGN.md §8.2): шапка с фильтрами, лента вишлиста,
// активные фильтры чипами, колода бирок.
export const GiftsPage = () => {
  const filters = useGiftFiltersStore((state) => state.filters);
  const setFilters = useGiftFiltersStore((state) => state.setFilters);
  const summary = useWishlistSummary();
  const [filtersOpen, setFiltersOpen] = useState(false);
  // Ссылка-фильтр уходит с тем черновиком, что сейчас в шторке фильтров.
  const [pickFilters, setPickFilters] = useState<ProductFilters>(filters);
  const [pickOpen, setPickOpen] = useState(false);
  // Друг увидит «Азамат хочет подарить тебе подарок» (DESIGN.md §8.6): нет
  // имени — NameSheet первым шагом шторки; NAME_REQUIRED — поверх и повтор.
  const requireName = useRequireName(NAME_CAPTIONS.pick);

  return (
    <Screen>
      <AppHeader
        title="Подарки"
        actions={
          <>
            {summary.shareUnlocked && <SendWishlistChip />}
            <FiltersButton
              filters={filters}
              onClick={() => setFiltersOpen(true)}
            />
          </>
        }
      />
      <div className="flex min-h-0 flex-1 flex-col pb-[var(--tabbar-space)]">
        <ActiveFilterChips filters={filters} onChange={setFilters} />
        <GiftDeck
          filters={filters}
          onEditFilters={() => setFiltersOpen(true)}
        />
      </div>
      <FiltersSheet
        open={filtersOpen}
        filters={filters}
        onClose={() => setFiltersOpen(false)}
        onApply={(next) => {
          setFilters(next);
          setFiltersOpen(false);
        }}
        onSendToFriend={(draft) => {
          setFiltersOpen(false);
          setPickFilters(draft);
          setPickOpen(true);
        }}
      />
      <PickRequestSheet
        open={pickOpen}
        filters={pickFilters}
        conditions={describeFilters(pickFilters)}
        onClose={() => setPickOpen(false)}
        nameStep={
          requireName.needsName ? (
            <NameForm caption={NAME_CAPTIONS.pick} />
          ) : undefined
        }
        onShareError={requireName.handleError}
      />
      {requireName.sheet}
    </Screen>
  );
};

// Лента, пока вкладка запускается или создаётся профиль (DESIGN.md §6
// «Прелоадер»): шапка «Подарки», лента из 5 сегментов, скелетон карточки —
// та же разметка, что у экрана, без данных. Таб-бар рисует каркас (app).
export const GiftsPageSkeleton = () => (
  <Screen>
    <AppHeader
      title="Подарки"
      actions={
        <FiltersButton filters={EMPTY_FILTERS} onClick={() => undefined} />
      }
    />
    <div className="flex min-h-0 flex-1 flex-col pb-[var(--tabbar-space)]">
      <GiftDeckSkeleton />
    </div>
  </Screen>
);
