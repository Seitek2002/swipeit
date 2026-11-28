"use client";

import { GripVertical, MoreVertical } from "lucide-react";
import { Reorder, useDragControls } from "motion/react";

import type { ItemDisplay } from "@/features/wishlist-edit";

import {
  type Product,
  describeVariant,
  imageForChoice,
  isRemovedProductError,
  useProduct,
} from "@/entities/product";
import { WishMiniTag, type WishlistItem } from "@/entities/wishlist";

import { REMOTE_COPY } from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";
import { useCustomImageUrl } from "@/shared/lib/dom";
import { formatDayMonth, formatPrice } from "@/shared/lib/format";

// Всё, что нужно мини-бирке и шторкам, — из желания и товара каталога.
export const useItemDisplay = (
  item: WishlistItem,
): { display: ItemDisplay; product?: Product } => {
  const productId =
    item.source.kind === "product" ? item.source.productId : undefined;
  const { data: product, error: productError } = useProduct(productId);
  // Товар убрали из каталога (BACKEND §8, S07): названия и фото больше
  // нет — строка остаётся, чтобы её можно было удалить как обычно.
  const removed =
    productId !== undefined && isRemovedProductError(productError);
  const customImage = useCustomImageUrl(
    item.source.kind === "custom" ? item.source.custom.imageKey : undefined,
  );

  let title = "…";
  let price: string | undefined;
  let imageSrc: null | string = null;
  if (item.source.kind === "custom") {
    const { custom } = item.source;
    title = custom.title;
    if (custom.priceMin !== undefined)
      price = formatPrice(custom.priceMin, custom.priceMax);
    imageSrc = customImage;
  } else if (product) {
    title = product.title;
    price = formatPrice(product.priceMin, product.priceMax);
    const image = imageForChoice(product, item.variantChoice);
    imageSrc = image ? withBasePath(image.src) : null;
  } else if (removed) {
    title = REMOTE_COPY.productRemovedTitle;
  }

  // «от Азамата, 14 марта» или просто дата (DESIGN.md §8.3, вкладка «Подарили»).
  const givenCaption = item.given
    ? [
        item.given.fromName
          ? // Имя — в именительном (P11): «от Бакыта» склоняется неверно.
            `даритель — ${item.given.fromName}`
          : "",
        formatDayMonth(item.given.at),
      ]
        .filter(Boolean)
        .join(", ")
    : undefined;

  return {
    product,
    display: {
      title,
      imageSrc,
      meta:
        item.status === "given" ? (
          <span className="text-caption text-ink-soft">{givenCaption}</span>
        ) : removed ? (
          <span className="text-caption text-ink-soft">
            {REMOTE_COPY.productRemoved}
          </span>
        ) : price ? (
          <span className="text-price text-[15px]">{price}</span>
        ) : undefined,
      variant: product
        ? describeVariant(product, item.variantChoice) || undefined
        : undefined,
    },
  };
};

type Props = {
  item: WishlistItem;
  onDragEnd?: () => void;
  onMenu: (item: WishlistItem, display: ItemDisplay, product?: Product) => void;
  reorderable: boolean;
};

const MenuButton = ({
  title,
  onClick,
}: {
  onClick: () => void;
  title: string;
}) => (
  <button
    type="button"
    aria-label={`Действия: ${title}`}
    onClick={onClick}
    className="text-ink-soft grid size-11 flex-none place-items-center rounded-full"
  >
    <MoreVertical aria-hidden size={20} strokeWidth={1.75} />
  </button>
);

// Строка вишлиста. Перетаскивание — только за ручку GripVertical, чтобы
// список свободно прокручивался пальцем (DESIGN.md §8.3).
export const WishRow = ({ item, onMenu, onDragEnd, reorderable }: Props) => {
  const controls = useDragControls();
  const { display, product } = useItemDisplay(item);

  const tag = (
    <WishMiniTag
      title={display.title}
      imageSrc={display.imageSrc}
      imageAlt={display.title}
      meta={display.meta}
      variant={display.variant}
      note={item.note}
      isTop={item.priority === "top" && item.status === "active"}
      dimmed={item.status === "given"}
      leading={
        reorderable ? (
          <span
            aria-hidden
            onPointerDown={(event) => controls.start(event)}
            className="text-ink-soft -my-2 -ml-1 grid h-11 w-6 flex-none cursor-grab touch-none place-items-center opacity-70"
          >
            <GripVertical size={18} strokeWidth={1.75} />
          </span>
        ) : undefined
      }
      trailing={
        <MenuButton
          title={display.title}
          onClick={() => onMenu(item, display, product)}
        />
      }
    />
  );

  if (!reorderable) return <li>{tag}</li>;

  return (
    <Reorder.Item
      value={item.id}
      dragListener={false}
      dragControls={controls}
      onDragEnd={onDragEnd}
      className="relative"
      whileDrag={{ scale: 1.02, zIndex: 10 }}
    >
      {tag}
    </Reorder.Item>
  );
};
