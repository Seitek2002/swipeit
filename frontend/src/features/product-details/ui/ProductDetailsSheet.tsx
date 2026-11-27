"use client";

import { useState } from "react";

import { GiftPhoto, type Product, type VariantGroup } from "@/entities/product";

import { formatPrice } from "@/shared/lib/format";
import { BottomSheet } from "@/shared/ui";

import { ProductDetailsSections, defaultChoice } from "./DetailsSections";

type Props = {
  hidePrices?: boolean;
  onClose: () => void;
  product: null | Product;
};

type Selection = { choice: Record<string, string>; id: string; photo: number };

// Шторка «Подробнее» (DESIGN.md §8.2) — там, где колоды нет: гостевой
// вишлист и ответ друга /pick/answer/. В колоде подарков подробности
// открываются прокруткой самой карточки (GiftCard), секции у них общие.
export const ProductDetailsSheet = ({
  product,
  onClose,
  hidePrices = false,
}: Props) => {
  // Последний открытый товар держим, пока шторка уезжает вниз, — иначе она
  // закрывалась бы пустой.
  const [shown, setShown] = useState(product);
  if (product && product !== shown) setShown(product);
  const [selection, setSelection] = useState<null | Selection>(null);

  const active: null | Selection =
    shown && selection?.id === shown.id
      ? selection
      : shown
        ? { id: shown.id, choice: defaultChoice(shown.variants), photo: 0 }
        : null;

  return (
    <BottomSheet
      open={product !== null}
      onClose={onClose}
      ariaLabel={shown?.title ?? "Подробнее"}
      height="full"
    >
      {shown && active && (
        <Details
          product={shown}
          hidePrices={hidePrices}
          choice={active.choice}
          photo={active.photo}
          onChange={(next) => setSelection({ ...active, ...next })}
        />
      )}
    </BottomSheet>
  );
};

type DetailsProps = {
  choice: Record<string, string>;
  hidePrices: boolean;
  onChange: (next: { choice?: Record<string, string>; photo?: number }) => void;
  photo: number;
  product: Product;
};

const Details = ({
  product,
  hidePrices,
  choice,
  photo,
  onChange,
}: DetailsProps) => {
  const images = product.images;
  const current = images[photo] ?? images[0];

  const choose = (group: VariantGroup, optionId: string) => {
    // Выбор цвета показывает его фото, если оно есть.
    const photoIndex = images.findIndex(
      (image) => image.variantOptionId === optionId,
    );
    onChange({
      choice: { ...choice, [group.id]: optionId },
      photo: photoIndex >= 0 ? photoIndex : photo,
    });
  };

  return (
    <div className="pb-4">
      {/* То же фото, что в карточке колоды: целиком поверх размытой копии,
          сегменты на затемнении сверху. */}
      <div className="relative aspect-[4/3.3] overflow-hidden rounded-2xl">
        <GiftPhoto
          product={product}
          image={current}
          index={photo}
          overlapInfo={false}
          onIndexChange={(index) => onChange({ photo: index })}
        />
      </div>

      <h2 className="text-title-2 mt-[18px]">{product.title}</h2>
      {!hidePrices && (
        <p className="text-price mt-1.5">
          {formatPrice(product.priceMin, product.priceMax)}
        </p>
      )}
      <div className="mt-4">
        <ProductDetailsSections
          tone="sheet"
          product={product}
          hidePrices={hidePrices}
          choice={choice}
          onChoose={choose}
        />
      </div>
    </div>
  );
};
