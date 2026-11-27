"use client";

import { useState } from "react";

import { Heart, Star, Undo2, X } from "lucide-react";
import { type MotionValue, motion, useTransform } from "motion/react";

import {
  ProductDetailsSections,
  defaultChoice,
} from "@/features/product-details";
import {
  type PhotoCardState,
  PhotoSwipeFeedback,
  usePhotoCard,
} from "@/features/swipe-deck";

import {
  GiftInfo,
  GiftMiniHeader,
  GiftPhoto,
  type Product,
  type VariantGroup,
} from "@/entities/product";

type Props = {
  hidePrices?: boolean;
  // Выбор варианта уходит в желание при «Хочу» (как раньше из шторки).
  onVariantChange: (choice: Record<string, string>) => void;
  product: Product;
};

// Цвета для перетекания кнопок (DESIGN.md §7 GiftCard): motion интерполирует
// строки rgba, токены CSS-переменными ему не подходят.
const PAPER = "rgba(255, 241, 243, 1)";
const INK = "rgba(42, 16, 36, 1)";
const MANDARIN_INK = "rgba(184, 70, 14, 1)";

const FEEDBACK_ICONS = {
  right: (
    <Heart
      size={32}
      strokeWidth={1.5}
      className="text-mandarin-ink fill-current"
    />
  ),
  left: <X size={32} strokeWidth={2.4} className="text-ink" />,
  up: (
    <Star
      size={32}
      strokeWidth={1.4}
      className="fill-champagne text-mandarin-ink"
    />
  ),
};

// Фото-карточка подарка (DESIGN.md §7 GiftCard, как карточка в tap-tap):
// первый экран — фото и текст, ниже прокруткой — мини-шапка и подробности,
// кнопки прилипают к низу и перетекают из стекла в бумагу.
export const GiftCard = ({
  product,
  hidePrices = false,
  onVariantChange,
}: Props) => {
  const state = usePhotoCard();
  const [photo, setPhoto] = useState(0);
  const [choice, setChoice] = useState(() => defaultChoice(product.variants));
  const image = product.images[photo] ?? product.images[0];

  const choose = (group: VariantGroup, optionId: string) => {
    const next = { ...choice, [group.id]: optionId };
    setChoice(next);
    onVariantChange(next);
    // Выбор цвета показывает его фото — в мини-шапке и наверху карточки.
    const index = product.images.findIndex(
      (item) => item.variantOptionId === optionId,
    );
    if (index >= 0) setPhoto(index);
  };

  return (
    <>
      <GiftPhoto
        product={product}
        image={image}
        index={photo}
        onIndexChange={setPhoto}
      >
        {state.isTop && (
          <PhotoSwipeFeedback
            x={state.x}
            up={state.up}
            icons={FEEDBACK_ICONS}
          />
        )}
        <GiftInfo
          product={product}
          hidePrices={hidePrices}
          onOpenDetails={state.scrollToDetails}
        />
      </GiftPhoto>
      {/* Мини-шапка и подробности не короче экрана карточки без ряда
          кнопок: иначе прокрутка к подробностям не доставала бы до шапки. */}
      <div className="min-h-[calc(100%-72px)]">
        <GiftMiniHeader product={product} image={image} />
        <div className="pb-3">
          <ProductDetailsSections
            product={product}
            hidePrices={hidePrices}
            choice={choice}
            onChoose={choose}
          />
        </div>
      </div>
      <GiftCardActions state={state} />
    </>
  );
};

const useGlass = (progress: MotionValue<number>, from: string, to: string) =>
  useTransform(progress, [0, 1], [from, to]);

// Ряд кнопок внутри карточки (DESIGN.md §7 GiftCard): прилипает к низу и
// улетает вместе с карточкой. Перетекание — только motion values, без
// ре-рендеров React во время прокрутки.
const GiftCardActions = ({ state }: { state: PhotoCardState }) => {
  const p = state.scrollProgress;
  const smallBg = useGlass(p, "rgba(255, 241, 243, 0.18)", PAPER);
  const smallColor = useGlass(p, PAPER, INK);
  const smallShadow = useGlass(
    p,
    "0px 6px 16px rgba(10, 0, 8, 0)",
    "0px 6px 16px rgba(10, 0, 8, 0.25)",
  );
  const passBg = useGlass(p, "rgba(255, 241, 243, 0.16)", PAPER);
  const likeBg = useGlass(p, "rgba(255, 138, 61, 0.92)", PAPER);
  const likeColor = useGlass(p, INK, MANDARIN_INK);
  const disabled = state.disabled || !state.isTop;

  return (
    <div className="sticky bottom-0 z-[3] px-5 pb-4">
      <motion.div
        aria-hidden
        style={{ opacity: p }}
        className="pointer-events-none absolute inset-x-0 -top-6 bottom-0 bg-linear-to-t from-[rgb(42_16_36/0.7)] via-[rgb(42_16_36/0.4)] via-55% to-[rgb(42_16_36/0)] backdrop-blur-[3px]"
      />
      <div className="relative flex items-center justify-between">
        <motion.button
          type="button"
          aria-label="Вернуть"
          disabled={disabled || !state.canUndo}
          onClick={state.undo}
          style={{
            backgroundColor: smallBg,
            color: smallColor,
            boxShadow: smallShadow,
          }}
          className="grid size-11 place-items-center rounded-full disabled:opacity-40"
        >
          <Undo2 aria-hidden size={20} strokeWidth={2} />
        </motion.button>
        <div className="flex gap-5">
          <motion.button
            type="button"
            aria-label="Мимо"
            disabled={disabled}
            onClick={() => state.swipe("left")}
            style={{ backgroundColor: passBg, color: smallColor }}
            className="grid size-14 place-items-center rounded-full shadow-[inset_2px_-1px_2px_rgb(255_255_255/0.16)] backdrop-blur-[30px]"
          >
            <X aria-hidden size={30} strokeWidth={2.4} />
          </motion.button>
          <motion.button
            type="button"
            aria-label="Хочу"
            disabled={disabled}
            onClick={() => state.swipe("right")}
            style={{ backgroundColor: likeBg, color: likeColor }}
            className="grid size-14 place-items-center rounded-full shadow-[inset_2px_-1px_2px_rgb(255_255_255/0.16)] backdrop-blur-[30px]"
          >
            <Heart
              aria-hidden
              size={30}
              strokeWidth={1.5}
              className="fill-current"
            />
          </motion.button>
        </div>
        <motion.button
          type="button"
          aria-label="Очень хочу"
          disabled={disabled}
          onClick={() => state.swipe("up")}
          style={{ backgroundColor: smallBg, boxShadow: smallShadow }}
          className="grid size-11 place-items-center rounded-full"
        >
          <Star
            aria-hidden
            size={26}
            strokeWidth={1.4}
            className="fill-champagne text-mandarin-ink"
          />
        </motion.button>
      </div>
    </div>
  );
};
