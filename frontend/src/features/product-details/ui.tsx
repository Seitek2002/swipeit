"use client";

import { useState } from "react";

import { ExternalLink } from "lucide-react";

import {
  type Product,
  type VariantGroup,
  VariantPicker,
  storeLabel,
} from "@/entities/product";

import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { BottomSheet, Button } from "@/shared/ui";

type Decision = "left" | "right";

type Props = {
  hidePrices?: boolean;
  onClose: () => void;
  // Решение из шторки: закрыть её и запустить ту же анимацию свайпа.
  onDecide?: (
    decision: Decision,
    variantChoice?: Record<string, string>,
  ) => void;
  product: null | Product;
};

const MONTHS = [
  "января",
  "февраля",
  "марта",
  "апреля",
  "мая",
  "июня",
  "июля",
  "августа",
  "сентября",
  "октября",
  "ноября",
  "декабря",
];

const checkedLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]}`;
};

type Selection = { choice: Record<string, string>; id: string; photo: number };

const defaultChoice = (groups: VariantGroup[] = []) =>
  Object.fromEntries(
    groups.flatMap((group) =>
      group.options[0] ? [[group.id, group.options[0].id]] : [],
    ),
  );

// Шторка «Подробнее» (DESIGN.md §8.2): все фото, описание, варианты
// («Мне подойдёт: чёрный, M»), где купить и почём, «Мимо» / «Хочу».
export const ProductDetailsSheet = ({
  product,
  onClose,
  onDecide,
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
      footer={
        shown &&
        active &&
        onDecide && (
          <div className="grid grid-cols-[1fr_1.4fr] gap-2.5">
            <Button
              size="lg"
              variant="secondary"
              onClick={() => onDecide("left")}
            >
              Мимо
            </Button>
            <Button
              size="lg"
              onClick={() =>
                onDecide(
                  "right",
                  shown.variants?.length ? active.choice : undefined,
                )
              }
            >
              Хочу
            </Button>
          </div>
        )
      }
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
  const setPhoto = (update: (index: number) => number) =>
    onChange({ photo: update(photo) });

  const images = product.images;
  const current = images[photo] ?? images[0];
  const paragraphs = product.description
    .split(/\n{2,}/)
    .filter(Boolean)
    .slice(0, 3);

  const choose = (group: VariantGroup, optionId: string) => {
    const next = { ...choice, [group.id]: optionId };
    // Выбор цвета показывает его фото, если оно есть.
    const photoIndex = images.findIndex(
      (image) => image.variantOptionId === optionId,
    );
    onChange({ choice: next, photo: photoIndex >= 0 ? photoIndex : photo });
  };

  const chosenLabels = (product.variants ?? [])
    .map(
      (group) =>
        group.options.find((option) => option.id === choice[group.id])?.label,
    )
    .filter(Boolean)
    .join(", ")
    .toLocaleLowerCase("ru");
  const latestCheck = product.offers
    .map((offer) => offer.checkedAt)
    .sort()
    .at(-1);

  return (
    <div className="pb-4">
      <div className="bg-paper-2 relative aspect-[4/3.3] overflow-hidden rounded-2xl">
        {current && (
          <img
            src={withBasePath(current.src)}
            alt={current.alt}
            className="absolute inset-0 size-full object-cover"
          />
        )}
        {images.length > 1 && (
          <>
            <div aria-hidden className="absolute inset-x-3 top-2.5 flex gap-1">
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
              aria-label="Предыдущее фото"
              onClick={() =>
                setPhoto((index) => (index - 1 + images.length) % images.length)
              }
              className="absolute inset-y-0 left-0 w-1/2 outline-offset-[-4px]"
            />
            <button
              type="button"
              aria-label="Следующее фото"
              onClick={() => setPhoto((index) => (index + 1) % images.length)}
              className="absolute inset-y-0 right-0 w-1/2 outline-offset-[-4px]"
            />
          </>
        )}
      </div>

      <h2 className="text-title-2 mt-[18px]">{product.title}</h2>
      {!hidePrices && (
        <p className="text-price mt-1.5">
          {formatPrice(product.priceMin, product.priceMax)}
        </p>
      )}
      {paragraphs.map((paragraph) => (
        <p key={paragraph.slice(0, 24)} className="text-body-lg text-rose mt-3">
          {paragraph}
        </p>
      ))}

      {product.variants && product.variants.length > 0 && (
        <p className="text-caption text-rose mt-[22px]">
          Мне подойдёт:{" "}
          <b className="text-paper font-semibold">{chosenLabels}</b>
        </p>
      )}
      {product.variants && product.variants.length > 0 && (
        <div className="mt-3">
          <VariantPicker
            groups={product.variants}
            choice={choice}
            onChoose={choose}
          />
        </div>
      )}

      <p className="text-caption text-rose mt-[22px] mb-2.5">Где купить</p>
      <ul className="border-line border-t">
        {product.offers.map((offer) => (
          <li key={offer.url}>
            <a
              href={offer.url}
              target="_blank"
              rel="noopener noreferrer"
              className="border-line flex min-h-[52px] items-center gap-2.5 border-b"
            >
              <span className="flex-1 text-[15px] leading-5 font-medium">
                {storeLabel(offer)}
              </span>
              {!hidePrices && (
                <span className="text-price text-[15px]">
                  {formatPrice(offer.price)}
                </span>
              )}
              <ExternalLink
                aria-hidden
                size={18}
                strokeWidth={1.75}
                className="text-rose"
              />
              <span className="sr-only">Открыть в магазине</span>
            </a>
          </li>
        ))}
      </ul>
      {!hidePrices && latestCheck && (
        <p className="text-caption text-rose mt-2.5">
          Цены примерные, обновлены {checkedLabel(latestCheck)}
        </p>
      )}
    </div>
  );
};
