import type { ProductFilters } from "./types";

// Константы — отдельно от схем zod в types.ts: их читают сторы на старте, и
// иначе вместе с ними в первый бандл попадал бы весь zod (Lighthouse, T20).
export const EMPTY_FILTERS: ProductFilters = {
  budget: { min: 0, max: null },
  categories: [],
  marketplaces: [],
};
