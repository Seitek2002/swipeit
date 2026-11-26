"use client";

import { useState } from "react";

import { Info } from "lucide-react";

import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { StoreTag } from "@/shared/ui";

import { type Product, colorSwatches, storeLabels } from "../model";

type Props = {
  // Цены скрыты («Выбери подарок сам» с hidePrices, T10).
  hidePrices?: boolean;
  isTop: boolean;
  onOpenDetails?: () => void;
  product: Product;
};

// Маска дырочки 14px (сквозь неё виден бархат) и колечко вокруг неё. Тень —
// на обёртке карточки в колоде: маска обрезала бы box-shadow (DESIGN.md §2).
const TAG_SHAPE =
  "paper rounded-paper flex h-full flex-col px-2.5 pt-[34px] pb-3 shadow-[0_1px_0_rgb(255_255_255/0.6)_inset] [mask:radial-gradient(circle_7px_at_50%_17px,#0000_96%,#000_100%)] before:border-paper-2 before:absolute before:top-[17px] before:left-1/2 before:-mt-3 before:-ml-3 before:size-6 before:rounded-full before:border-[3px] before:content-['']";

// Бирка подарка (DESIGN.md §7 GiftTagCard) — главный компонент. Тап по левой
// трети фото — предыдущее фото, по остальному фото — следующее; тап по
// текстовой части или по «(i)» — «Подробнее».
export const GiftTagCard = ({
  product,
  isTop,
  onOpenDetails,
  hidePrices = false,
}: Props) => {
  const [photo, setPhoto] = useState(0);
  const images = product.images;
  const current = images[photo] ?? images[0];
  const swatches = colorSwatches(product);
  const stores = storeLabels(product).slice(0, 2);

  const step = (delta: number) =>
    setPhoto((index) => (index + delta + images.length) % images.length);

  return (
    <>
      {isTop && (
        // Нитка уходит за верх бирки.
        <svg
          aria-hidden
          viewBox="0 0 40 56"
          className="pointer-events-none absolute -top-[34px] left-1/2 -ml-5 h-14 w-10"
        >
          <path
            d="M20 51C13 36 27 20 18 0"
            className="stroke-rose fill-none"
            strokeWidth={1.6}
            strokeLinecap="round"
          />
        </svg>
      )}
      <article className={TAG_SHAPE}>
        <div className="bg-paper-2 relative min-h-0 flex-1 overflow-hidden rounded-2xl">
          {current && (
            <img
              src={withBasePath(current.src)}
              alt={current.alt}
              draggable={false}
              loading={isTop ? "eager" : "lazy"}
              className="absolute inset-0 size-full object-cover select-none"
            />
          )}
          {images.length > 1 && (
            <>
              <div
                aria-hidden
                className="absolute inset-x-3 top-2.5 z-[2] flex gap-1"
              >
                {images.map((image, index) => (
                  <i
                    key={image.src}
                    className={cn(
                      "h-[3px] flex-1 rounded-sm",
                      index === photo ? "bg-ink" : "bg-ink/20",
                    )}
                  />
                ))}
              </div>
              <button
                type="button"
                tabIndex={isTop ? 0 : -1}
                aria-label="Предыдущее фото"
                onClick={() => step(-1)}
                className="absolute inset-y-0 left-0 z-[3] w-1/3 outline-offset-[-4px]"
              />
              <button
                type="button"
                tabIndex={isTop ? 0 : -1}
                aria-label="Следующее фото"
                onClick={() => step(1)}
                className="absolute inset-y-0 right-0 z-[3] w-2/3 outline-offset-[-4px]"
              />
            </>
          )}
          {swatches.length > 0 && (
            <div
              aria-hidden
              className="bg-paper/70 absolute bottom-3 left-1/2 z-[2] flex -translate-x-1/2 gap-1.5 rounded-full px-2 py-[5px]"
            >
              {swatches.map((hex) => (
                <i
                  key={hex}
                  className="size-2.5 rounded-full shadow-[inset_0_0_0_1px_rgb(42_16_36/0.25)]"
                  style={{ background: hex }}
                />
              ))}
            </div>
          )}
        </div>

        <div
          className="flex-none px-1.5 pt-3"
          onClick={onOpenDetails}
          role="presentation"
        >
          <h3 className="text-title-2 line-clamp-2">{product.title}</h3>
          {!hidePrices && (
            <p className="text-price mt-1.5">
              {formatPrice(product.priceMin, product.priceMax)}
            </p>
          )}
          <div className="mt-2.5 flex items-center gap-1.5">
            {stores.map((store) => (
              <StoreTag key={store} className="max-w-[40%] truncate">
                {store}
              </StoreTag>
            ))}
            <button
              type="button"
              tabIndex={isTop ? 0 : -1}
              aria-label={`Подробнее: ${product.title}`}
              onClick={(event) => {
                event.stopPropagation();
                onOpenDetails?.();
              }}
              className="text-ink-soft -my-2 -mr-2 ml-auto grid size-11 place-items-center rounded-full"
            >
              <Info aria-hidden size={20} strokeWidth={1.75} />
            </button>
          </div>
        </div>
      </article>
    </>
  );
};

// Скелетон бирки — та же форма, «Бумага-2» с переливом (DESIGN.md §7).
export const GiftTagSkeleton = () => (
  <div className={cn(TAG_SHAPE, "bg-paper-2")} aria-hidden>
    <div className="skeleton bg-paper min-h-0 flex-1 rounded-2xl" />
    <div className="flex-none px-1.5 pt-3">
      <div className="skeleton bg-paper h-6 w-4/5 rounded-md" />
      <div className="skeleton bg-paper mt-2.5 h-5 w-2/5 rounded-md" />
      <div className="mt-3 flex gap-1.5">
        <div className="skeleton bg-paper h-7 w-24 rounded-full" />
        <div className="skeleton bg-paper h-7 w-16 rounded-full" />
      </div>
    </div>
  </div>
);
