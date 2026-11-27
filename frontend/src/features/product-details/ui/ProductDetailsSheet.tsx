"use client";

import { useState } from "react";

import { GiftPhoto, type Product, type VariantGroup } from "@/entities/product";

import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice } from "@/shared/lib/format";
import { usePreloadImages } from "@/shared/lib/image-cache";
import { BottomSheet } from "@/shared/ui";

import { ProductDetailsSections } from "./DetailsSections";

const EMPTY_CHOICE: Record<string, string> = {};

type Props = {
  // Выбор владельца желания или друга («мне — белый»). Шторка — только
  // посмотреть: её открывают гость и автор ссылки-фильтра (auto-tasks U03).
  choice?: Record<string, string>;
  // Подпись выбора: «В вишлисте», «Выбрано».
  choiceCaption?: string;
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
  choice = EMPTY_CHOICE,
  choiceCaption = "В вишлисте",
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
        ? {
            id: shown.id,
            choice,
            // Фото выбранного цвета, если оно есть.
            photo: Math.max(
              0,
              shown.images.findIndex((image) =>
                Object.values(choice).includes(image.variantOptionId ?? ""),
              ),
            ),
          }
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
          choiceCaption={choiceCaption}
          photo={active.photo}
          onChange={(next) => setSelection({ ...active, ...next })}
        />
      )}
    </BottomSheet>
  );
};

type DetailsProps = {
  choice: Record<string, string>;
  choiceCaption: string;
  hidePrices: boolean;
  onChange: (next: { choice?: Record<string, string>; photo?: number }) => void;
  photo: number;
  product: Product;
};

const Details = ({
  product,
  hidePrices,
  choice,
  choiceCaption,
  photo,
  onChange,
}: DetailsProps) => {
  const images = product.images;
  const current = images[photo] ?? images[0];
  // Все фото товара — сразу при открытии, тем же кешем, что и колода
  // (TECH_SPEC §6): листание в шторке без ожидания.
  usePreloadImages(
    "details",
    images.map((image) => withBasePath(image.src)),
  );

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
          readOnlyCaption={choiceCaption}
        />
      </div>
    </div>
  );
};
