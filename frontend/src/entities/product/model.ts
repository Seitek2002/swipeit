import type { Offer, Product } from "@/shared/api";
import { MARKETPLACE_LABELS, shopHost, shopLabel } from "@/shared/config";

// Типы каталога — контракт API в shared/api (см. entities/user/model.ts).
export {
  EMPTY_FILTERS,
  type FeedResponse,
  type Offer,
  type Product,
  type ProductFilters,
  type ProductImage,
  type VariantGroup,
  type VariantOption,
} from "@/shared/api";

// Название магазина текстом (DESIGN.md §7: без логотипов). Для «другого»
// магазина — по домену ссылки: «kivano.kg», «Лабиринт». Те же имена — у чипов
// «Магазины» в фильтрах (UX-аудит M1).
export const storeLabel = (offer: Offer): string => {
  if (offer.marketplace !== "other")
    return MARKETPLACE_LABELS[offer.marketplace];
  const host = shopHost(offer.url);
  return host ? shopLabel(host) : MARKETPLACE_LABELS.other;
};

// Магазины товара без повторов, в порядке офферов.
export const storeLabels = (product: Product): string[] => [
  ...new Set(product.offers.map(storeLabel)),
];

// Цвета для точек-сваточей на бирке (DESIGN.md §7: если у товара есть
// варианты с цветами).
export const colorSwatches = (product: Product): string[] =>
  product.variants
    ?.find((group) => group.kind === "color")
    ?.options.map((option) => option.hex)
    .filter((hex): hex is string => Boolean(hex))
    .slice(0, 6) ?? [];

// «чёрный, M» — выбранный вариант словами.
export const describeVariant = (
  product: Product,
  choice?: Record<string, string>,
): string =>
  (product.variants ?? [])
    .map(
      (group) =>
        group.options.find((option) => option.id === choice?.[group.id])?.label,
    )
    .filter(Boolean)
    .join(", ")
    .toLocaleLowerCase("ru");

// Первое фото — или фото выбранного цвета, если оно есть.
export const imageForChoice = (
  product: Product,
  choice?: Record<string, string>,
) => {
  const chosen = Object.values(choice ?? {});
  return (
    product.images.find(
      (image) =>
        image.variantOptionId && chosen.includes(image.variantOptionId),
    ) ?? product.images[0]
  );
};
