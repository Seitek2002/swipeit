"use client";

import { useState } from "react";

import { ChevronDown, Gift, Star } from "lucide-react";

import {
  describeVariant,
  imageForChoice,
  useProduct,
} from "@/entities/product";
import type { SantaWardItem } from "@/entities/santa-game";

import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";

const WardRow = ({ item }: { item: SantaWardItem }) => {
  const { data: product } = useProduct(item.productId);
  const image = product
    ? imageForChoice(product, item.variantChoice)
    : undefined;
  const title = product?.title ?? item.custom?.title ?? "…";
  const variant = product ? describeVariant(product, item.variantChoice) : "";
  const price =
    item.priceMin === null ? "" : formatPrice(item.priceMin, item.priceMax);
  return (
    <li className="paper rounded-paper shadow-paper flex items-center gap-3 p-2.5">
      <div className="bg-paper-2 relative grid size-16 flex-none place-items-center overflow-hidden rounded-[14px]">
        {image ? (
          <img
            src={withBasePath(image.src)}
            alt=""
            className="size-full object-cover"
          />
        ) : (
          <Gift
            aria-hidden
            size={26}
            strokeWidth={1.5}
            className="text-ink-soft"
          />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-title-3 line-clamp-2">
          {item.priority === "top" && (
            <Star
              role="img"
              aria-label="Очень хочу"
              size={14}
              strokeWidth={1.75}
              className="fill-champagne text-champagne mr-1 inline align-[-1px]"
            />
          )}
          {title}
        </p>
        {price && <p className="text-price mt-0.5 text-[15px]">{price}</p>}
        {(variant || item.note) && (
          <p className="text-caption text-ink-soft mt-0.5 line-clamp-2">
            {[variant && `Подойдёт: ${variant}`, item.note && `«${item.note}»`]
              .filter(Boolean)
              .join(" · ")}
          </p>
        )}
      </div>
    </li>
  );
};

// Вишлист подопечного (DESIGN.md §8.8): сначала то, что в бюджете игры;
// дороже бюджета — свёрнуто под «Дороже бюджета: 4».
export const WardWishlist = ({
  items,
  name,
}: {
  items: SantaWardItem[];
  name: string;
}) => {
  const [showOver, setShowOver] = useState(false);
  const inBudget = items.filter((item) => !item.overBudget);
  const overBudget = items.filter((item) => item.overBudget);

  if (items.length === 0) {
    return (
      <p className="text-body text-rose">
        У {name} пока пустой вишлист. Загляни позже — или подари что-то на свой
        вкус в рамках бюджета.
      </p>
    );
  }

  return (
    <section aria-label={`Вишлист: ${name}`} className="flex flex-col gap-3">
      <h2 className="text-label">Вишлист: {name}</h2>
      {inBudget.length === 0 && (
        <p className="text-caption text-rose">
          В бюджете ничего нет — посмотри, что дороже, или выбери сам.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {inBudget.map((item) => (
          <WardRow key={item.key} item={item} />
        ))}
      </ul>
      {overBudget.length > 0 && (
        <>
          <button
            type="button"
            aria-expanded={showOver}
            onClick={() => setShowOver(!showOver)}
            className="text-label text-rose flex min-h-11 items-center gap-1.5 self-start"
          >
            Дороже бюджета: {overBudget.length}
            <ChevronDown
              aria-hidden
              size={18}
              strokeWidth={1.75}
              className={cn("transition-transform", showOver && "rotate-180")}
            />
          </button>
          {showOver && (
            <ul className="flex flex-col gap-3 opacity-80">
              {overBudget.map((item) => (
                <WardRow key={item.key} item={item} />
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
};
