import type { Offer, Product } from "@/shared/api";
import { MARKETPLACE_LABELS } from "@/shared/config";

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
// магазина — его домен: «kivano.kg» понятнее, чем «Другой магазин».
export const storeLabel = (offer: Offer): string => {
  if (offer.marketplace !== "other")
    return MARKETPLACE_LABELS[offer.marketplace];
  try {
    return new URL(offer.url).hostname.replace(/^www\./, "");
  } catch {
    return MARKETPLACE_LABELS.other;
  }
};

// Магазины товара без повторов, в порядке офферов.
export const storeLabels = (product: Product): string[] => [
  ...new Set(product.offers.map(storeLabel)),
];

const cheaper = (best: Offer, offer: Offer) =>
  offer.price < best.price ? offer : best;

// Самый дешёвый оффер — куда ведёт «Купить на …» у гостя после брони
// (DESIGN.md §8.5). Офферов у товара всегда хотя бы один (ProductSchema).
export const cheapestOffer = (product: Product): Offer =>
  product.offers.reduce(cheaper);

// Магазины без повторов, у каждого — его самый дешёвый оффер: плашки
// магазинов на карточке гостя — ссылки (DESIGN.md §8.5).
export const storeOffers = (
  product: Product,
): { label: string; offer: Offer }[] => {
  const byLabel = new Map<string, Offer>();
  for (const offer of product.offers) {
    const label = storeLabel(offer);
    const best = byLabel.get(label);
    byLabel.set(label, best ? cheaper(best, offer) : offer);
  }
  return [...byLabel].map(([label, offer]) => ({ label, offer }));
};

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
