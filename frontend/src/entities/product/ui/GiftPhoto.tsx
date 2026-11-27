"use client";

import type { ReactNode } from "react";

import { ChevronsDown, ShoppingBag } from "lucide-react";

import { CATEGORY_LABELS } from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";

import {
  type Product,
  type ProductImage,
  colorSwatches,
  storeLabels,
} from "../model";

type PhotoProps = {
  // Поверх фото: отклик на жест и текстовый блок (GiftInfo).
  children?: ReactNode;
  image?: ProductImage;
  index: number;
  onIndexChange: (index: number) => void;
  // Фото заходит под текстовый блок на 28px (карточка в колоде). В шторке
  // «Подробнее» текста поверх нет — фото целиком в своей рамке.
  overlapInfo?: boolean;
  product: Product;
};

// Первый экран фото-карточки подарка (DESIGN.md §7 GiftCard): фото целиком
// (contain) поверх своей размытой копии — у белых фото фон белый, у тёмных
// тёмный, полос нет и товар не обрезается. Сверху затемнение под сегменты,
// тап по левой/правой половине — предыдущее/следующее фото.
export const GiftPhoto = ({
  product,
  image,
  index,
  onIndexChange,
  overlapInfo = true,
  children,
}: PhotoProps) => {
  const count = product.images.length;
  const src = image ? withBasePath(image.src) : undefined;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      {src && (
        <img
          src={src}
          alt=""
          aria-hidden
          draggable={false}
          className="absolute -inset-10 size-[calc(100%+80px)] max-w-none object-cover blur-[28px] saturate-[1.1] select-none"
        />
      )}
      {/* Область фото заходит под текстовый блок на 28px. */}
      <div className={cn("relative min-h-0 flex-1", overlapInfo && "-mb-7")}>
        {src && (
          <img
            src={src}
            alt={image?.alt ?? product.title}
            draggable={false}
            className="block size-full object-contain select-none"
          />
        )}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[72px] bg-linear-to-b from-[rgb(42_16_36/0.38)] to-transparent"
      />
      {count > 1 && (
        <>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-3 top-3 flex gap-1.5"
          >
            {product.images.map((item, position) => (
              <i
                key={item.src}
                className={cn(
                  "h-1 flex-1 rounded-sm",
                  position === index
                    ? "bg-paper"
                    : "bg-[rgb(255_241_243/0.45)]",
                )}
              />
            ))}
          </div>
          <button
            type="button"
            aria-label="Предыдущее фото"
            onClick={() => onIndexChange(Math.max(0, index - 1))}
            className="absolute inset-y-0 left-0 w-1/2 outline-offset-[-4px]"
          />
          <button
            type="button"
            aria-label="Следующее фото"
            onClick={() => onIndexChange(Math.min(count - 1, index + 1))}
            className="absolute inset-y-0 right-0 w-1/2 outline-offset-[-4px]"
          />
        </>
      )}
      {children}
    </div>
  );
};

type InfoProps = {
  // Под обучающим слоем блок скрыт: подсказка легла бы на название и цену, его
  // роль играет кнопка слоя (DESIGN.md §7 DeckGuide). Для скринридера он есть.
  concealed?: boolean;
  hidePrices?: boolean;
  onOpenDetails: () => void;
  product: Product;
};

// Текстовый блок снизу поверх фото: категория, название, цена, магазины,
// сваточи. Весь блок — кнопка: тап прокручивает карточку к подробностям.
export const GiftInfo = ({
  product,
  hidePrices = false,
  concealed = false,
  onOpenDetails,
}: InfoProps) => {
  const swatches = colorSwatches(product).slice(0, 4);
  const stores = storeLabels(product).slice(0, 2).join(", ");

  return (
    <div
      className={cn(
        "text-paper relative bg-[linear-gradient(to_bottom,rgb(42_16_36/0)_0,rgb(42_16_36/0.88)_44px,rgb(42_16_36/0.96)_100%)] px-4 pt-11 pb-[88px]",
        concealed && "*:opacity-0",
      )}
    >
      <span className="bg-mint text-ink inline-flex h-6 items-center rounded-full px-2.5 text-[12px] font-semibold">
        {CATEGORY_LABELS[product.category]}
      </span>
      <button
        type="button"
        onClick={onOpenDetails}
        className="mt-2 flex w-full items-end justify-between gap-3 text-left"
      >
        <span className="min-w-0">
          <span className="text-title-2 line-clamp-2">{product.title}</span>
          <span className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
            {!hidePrices && (
              <span className="text-price">
                {formatPrice(product.priceMin, product.priceMax)}
              </span>
            )}
            <span className="text-caption flex min-w-0 items-center gap-1 text-[rgb(255_241_243/0.8)]">
              <ShoppingBag aria-hidden size={14} strokeWidth={2} />
              <span className="truncate">{stores}</span>
            </span>
            {swatches.length > 0 && (
              <span aria-hidden className="flex gap-1">
                {swatches.map((hex) => (
                  <i
                    key={hex}
                    className="size-3 rounded-full shadow-[0_0_0_1.5px_rgb(255_241_243/0.7)]"
                    style={{ background: hex }}
                  />
                ))}
              </span>
            )}
          </span>
          {/* Имя кнопки включает видимый текст (axe label-content-name). */}
          <span className="sr-only">. Подробнее о подарке</span>
        </span>
        <ChevronsDown
          aria-hidden
          size={24}
          strokeWidth={2}
          className="flex-none"
        />
      </button>
    </div>
  );
};

// Мини-шапка: прилипает к верху карточки, когда фото уехало вверх.
export const GiftMiniHeader = ({
  product,
  image,
}: {
  image?: ProductImage;
  product: Product;
}) => (
  <div className="bg-velvet sticky top-0 z-[2] flex items-center gap-3 px-4 py-3">
    {image && (
      <img
        src={withBasePath(image.src)}
        alt=""
        className="size-9 flex-none rounded-[10px] bg-white object-contain"
      />
    )}
    <span className="text-paper truncate text-[17px] leading-[22px] font-semibold">
      {product.title}
    </span>
  </div>
);

// Скелетон фото-карточки — та же форма: бархат-2 с переливом, на месте
// текста — полосы (DESIGN.md §7 GiftCard).
export const GiftCardSkeleton = () => (
  <div
    aria-hidden
    className="skeleton bg-velvet-2 absolute inset-0 flex flex-col justify-end rounded-[24px] px-4 pb-[88px]"
  >
    <div className="bg-velvet-3 h-6 w-24 rounded-full" />
    <div className="bg-velvet-3 mt-3 h-7 w-4/5 rounded-md" />
    <div className="bg-velvet-3 mt-2.5 h-5 w-2/5 rounded-md" />
  </div>
);
