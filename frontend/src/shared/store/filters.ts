import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

import { EMPTY_FILTERS } from "@/shared/api/catalog/constants";
import type { ProductFilters } from "@/shared/api/catalog/types";

type GiftFiltersState = {
  filters: ProductFilters;
  reset: () => void;
  setFilters: (filters: ProductFilters) => void;
};

// Текущие фильтры ленты подарков (TECH_SPEC §9: gift-filters в localStorage).
export const useGiftFiltersStore = create<GiftFiltersState>()(
  persist(
    (set) => ({
      filters: EMPTY_FILTERS,
      setFilters: (filters) => set({ filters }),
      reset: () => set({ filters: EMPTY_FILTERS }),
    }),
    {
      name: "swipeit:gift-filters",
      storage: createJSONStorage(() => localStorage),
    },
  ),
);
