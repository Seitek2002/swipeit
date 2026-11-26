"use client";

import { useState } from "react";

import Link from "next/link";

import { AppHeader } from "@/widgets/app-header";
import { GiftDeck } from "@/widgets/gift-deck";

import {
  ActiveFilterChips,
  FiltersButton,
  FiltersSheet,
} from "@/features/product-filters";

import { useWishlistSummary } from "@/entities/wishlist";

import { ROUTES } from "@/shared/config";
import { useGiftFiltersStore } from "@/shared/store";
import { Bow, Screen } from "@/shared/ui";

// После открытия шеринга лента прогресса превращается в маленький бант-кнопку
// «Отправить» в шапке (DESIGN.md §7 WishRibbon).
const SendWishlistChip = () => (
  <Link
    href={ROUTES.WISHLIST}
    className="bg-velvet-2 border-line text-paper rounded-chip relative mr-1 inline-flex h-9 items-center gap-1.5 border pr-3 pl-2 text-[13px] leading-none font-semibold before:absolute before:-inset-1 before:content-['']"
  >
    <Bow className="h-[18px] w-[26px]" />
    Отправить
  </Link>
);

// Экран «Подарки» (DESIGN.md §8.2): шапка с фильтрами, лента вишлиста,
// активные фильтры чипами, колода бирок.
export const GiftsPage = () => {
  const filters = useGiftFiltersStore((state) => state.filters);
  const setFilters = useGiftFiltersStore((state) => state.setFilters);
  const summary = useWishlistSummary();
  const [filtersOpen, setFiltersOpen] = useState(false);

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
      />
    </Screen>
  );
};
