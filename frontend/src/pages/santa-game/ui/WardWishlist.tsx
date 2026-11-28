"use client";

import { useState } from "react";

import { useQuery } from "@tanstack/react-query";
import { ChevronDown, ExternalLink, Gift, Star } from "lucide-react";

import { ProductDetailsSheet } from "@/features/product-details";

import {
  type Product,
  cheapestOffer,
  describeVariant,
  imageForChoice,
  storeLabel,
  useProduct,
  useRemovedProductIds,
  withoutRemovedProducts,
} from "@/entities/product";
import type { SantaWardItem } from "@/entities/santa-game";

import { EMPTY_FILTERS, catalogKeys, getFeed } from "@/shared/api";
import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Skeleton } from "@/shared/ui";

import { needsSantaIdeas, santaIdeas } from "../model/ideas";

type OpenDetails = (product: Product, choice?: Record<string, string>) => void;

// Куда идти покупать (auto-tasks U10): товар — в самый дешёвый магазин, своё
// желание — по ссылке подопечного.
const buyLinkOf = (item: SantaWardItem, product?: Product) => {
  if (product) {
    const offer = cheapestOffer(product);
    return { href: offer.url, label: `Купить на ${storeLabel(offer)}` };
  }
  return item.custom?.url
    ? { href: item.custom.url, label: "Где купить" }
    : null;
};

const WardRow = ({
  item,
  onOpen,
}: {
  item: SantaWardItem;
  onOpen: OpenDetails;
}) => {
  const { data: product } = useProduct(item.productId);
  const image = product
    ? imageForChoice(product, item.variantChoice)
    : undefined;
  const title = product?.title ?? item.custom?.title ?? "…";
  const variant = product ? describeVariant(product, item.variantChoice) : "";
  const price =
    item.priceMin === null ? "" : formatPrice(item.priceMin, item.priceMax);
  // Друзья уже выбрали (X02) — без «Купить», приглушённо.
  const buy = item.reserved ? null : buyLinkOf(item, product);
  return (
    <li
      className={cn(
        "paper rounded-paper shadow-paper flex items-start gap-3 p-2.5",
        item.reserved && "opacity-60",
      )}
    >
      {/* Фото открывает подробности (только посмотреть — выбор подопечного),
          как у гостя (auto-tasks U10). */}
      <button
        type="button"
        disabled={!product}
        onClick={() => product && onOpen(product, item.variantChoice)}
        aria-label={product ? `Подробнее: ${title}` : title}
        className="bg-paper-2 relative grid size-16 flex-none place-items-center overflow-hidden rounded-[14px]"
      >
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
      </button>
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
              .join(". ")}
          </p>
        )}
        {item.reserved && (
          <p className="text-caption text-ink-soft mt-1">
            Уже выбрали — возьми другое
          </p>
        )}
        {item.reservedByMe && (
          <p className="text-caption text-ink mt-1 font-semibold">
            Это твоя покупка
          </p>
        )}
        {buy && (
          // Следующий шаг Санты — купить: «мандарин-чернила», как у гостя.
          <a
            href={buy.href}
            target="_blank"
            rel="noopener noreferrer"
            className="text-mandarin-ink -mb-1.5 flex min-h-11 items-center gap-1.5 text-[15px] leading-5 font-semibold"
          >
            {buy.label}
            <ExternalLink aria-hidden size={16} strokeWidth={2} />
          </a>
        )}
      </div>
    </li>
  );
};

// Вишлист подопечного (DESIGN.md §8.8): сначала то, что в бюджете игры;
// дороже бюджета — свёрнуто под «Дороже бюджета: 4».
// Идеи из каталога в бюджете игры (P05): лента без записи свайпов, с
// запасом — чтобы набрать 6 из разных категорий.
const useSantaIdeas = (budget: number, enabled: boolean) =>
  useQuery({
    queryKey: catalogKeys.feed("santa-ideas", {
      ...EMPTY_FILTERS,
      budget: { min: 0, max: budget },
    }),
    queryFn: () =>
      getFeed({
        filters: { ...EMPTY_FILTERS, budget: { min: 0, max: budget } },
        context: "self",
        limit: 30,
      }),
    enabled,
    staleTime: Infinity,
  });

// Идея — в виде строки вишлиста подопечного, но без звезды и заметки.
const ideaItem = (product: Product): SantaWardItem => ({
  key: product.id,
  productId: product.id,
  priority: "normal",
  overBudget: false,
  priceMin: product.priceMin,
  priceMax: product.priceMax,
});

const SantaIdeas = ({
  budget,
  name,
  empty,
  exclude,
  onOpen,
}: {
  budget: number;
  empty: boolean;
  exclude: ReadonlySet<string>;
  name: string;
  onOpen: OpenDetails;
}) => {
  const feed = useSantaIdeas(budget, true);
  const ideas = santaIdeas(feed.data?.items ?? [], budget, exclude);
  if (feed.isPending) {
    return <Skeleton tone="paper" className="h-20 rounded-[18px]" />;
  }
  if (ideas.length === 0) return null;
  return (
    <section aria-label="Идеи в бюджете" className="flex flex-col gap-3">
      <h2 className="text-label">Идеи до {formatPrice(budget)}</h2>
      <p className="text-caption text-rose -mt-1.5">
        {empty
          ? `Вишлист пока пустой (${name}) — вот что есть в бюджете игры`
          : "В бюджете мало желаний — вот ещё идеи из каталога"}
      </p>
      <ul className="flex flex-col gap-3">
        {ideas.map((product) => (
          <WardRow key={product.id} item={ideaItem(product)} onOpen={onOpen} />
        ))}
      </ul>
    </section>
  );
};

export const WardWishlist = ({
  items: allItems,
  name,
  budget,
}: {
  budget: number;
  items: SantaWardItem[];
  name: string;
}) => {
  const [showOver, setShowOver] = useState(false);
  const [details, setDetails] = useState<{
    choice?: Record<string, string>;
    product: Product;
  } | null>(null);
  const open: OpenDetails = (product, choice) =>
    setDetails({ product, choice });
  // Товар убрали из каталога (S07) — Санте такое желание не показываем, как
  // подаренное: купить его негде.
  const removedIds = useRemovedProductIds(
    allItems.flatMap((item) => (item.productId ? [item.productId] : [])),
  );
  const items = withoutRemovedProducts(allItems, removedIds);
  const inBudget = items.filter((item) => !item.overBudget);
  const overBudget = items.filter((item) => item.overBudget);

  // Меньше трёх желаний в бюджете — идеи из каталога (P05).
  const showIdeas = needsSantaIdeas(inBudget.length);
  const wishlistProductIds = new Set(
    items.flatMap((item) => (item.productId ? [item.productId] : [])),
  );
  const ideasBlock = showIdeas && (
    <SantaIdeas
      budget={budget}
      name={name}
      empty={items.length === 0}
      exclude={wishlistProductIds}
      onOpen={open}
    />
  );

  if (items.length === 0) {
    return (
      <div className="flex flex-col gap-5">
        {ideasBlock}
        <ProductDetailsSheet
          product={details?.product ?? null}
          choice={details?.choice}
          onClose={() => setDetails(null)}
        />
      </div>
    );
  }

  return (
    <section aria-label={`Вишлист: ${name}`} className="flex flex-col gap-3">
      <h2 className="text-label">Вишлист: {name}</h2>
      {inBudget.length === 0 && (
        <p className="text-caption text-rose">
          В бюджете ничего нет — посмотри, что дороже, или выбери свой подарок.
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {inBudget.map((item) => (
          <WardRow key={item.key} item={item} onOpen={open} />
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
                <WardRow key={item.key} item={item} onOpen={open} />
              ))}
            </ul>
          )}
        </>
      )}
      {ideasBlock}
      <ProductDetailsSheet
        product={details?.product ?? null}
        choice={details?.choice}
        onClose={() => setDetails(null)}
      />
    </section>
  );
};
