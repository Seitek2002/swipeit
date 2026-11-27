"use client";

import { type ReactNode, useState } from "react";

import { Gift, Star } from "lucide-react";

import { NAME_CAPTIONS, useRequireName } from "@/features/ask-name";
import { ProductDetailsSheet } from "@/features/product-details";
import {
  type BuyLink,
  type NameGuard,
  ReserveControl,
} from "@/features/reserve-gift";

import {
  type Product,
  cheapestOffer,
  describeVariant,
  imageForChoice,
  storeLabel,
  storeOffers,
  useProduct,
} from "@/entities/product";

import type { GuestWishlist } from "@/shared/api";
import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice } from "@/shared/lib/format";
import { StoreTag } from "@/shared/ui";

import { GuestWishlistHeader } from "./GuestWishlistHeader";

type Item = GuestWishlist["items"][number];

// Куда идти покупать после брони (DESIGN.md §8.5): товар — в самый дешёвый
// магазин, своё желание — по ссылке, которую дал владелец.
const buyLinkOf = (item: Item, product?: Product): BuyLink | undefined => {
  if (product) {
    const offer = cheapestOffer(product);
    return { href: offer.url, store: storeLabel(offer) };
  }
  const url = item.custom?.url;
  if (!url) return undefined;
  try {
    return { href: url, store: new URL(url).hostname.replace(/^www\./, "") };
  } catch {
    return { href: url };
  }
};

type Props = {
  // Внизу страницы: «Собрать свой вишлист» у гостя по ссылке (T09).
  footer?: ReactNode;
  // Под шапкой вишлиста (имя, повод, сообщение): «Предложить выбрать
  // подарок» на профиле друга (DESIGN.md §8.6 «Где начать»).
  headerAction?: ReactNode;
  // Пол для «Вишлист Азамата»; у гостя по ссылке неизвестен.
  ownerGender?: "female" | "male";
  // Брони привязаны к id владельца (TECH_SPEC §5 Reservation.ownerId).
  ownerId: string;
  // Владелец смотрит свою ссылку «как друзья»: бронировать своё нельзя.
  readOnly?: boolean;
  // Следующий шаг гостя после первой брони — под этой карточкой, ниже
  // «Купить на …» (auto-tasks P01). dismiss — «Не сейчас»: до конца
  // страницы больше не показываем.
  renderAfterReserve?: (dismiss: () => void) => ReactNode;
  // Под шапкой со своим h1 (профиль друга) — h2, на странице ссылки — h1.
  titleAs?: "h1" | "h2";
  wishlist: GuestWishlist;
};

// Бирка-карточка гостя (DESIGN.md §8.5, reference .g-card): крупнее, чем у
// владельца, — фото 16:10, вариант, заметка, магазины и бронь.
const GuestWishCard = ({
  item,
  ownerId,
  readOnly,
  nameGuard,
  onOpen,
  onReserved,
  afterReserve,
}: {
  afterReserve?: ReactNode;
  item: Item;
  nameGuard: NameGuard;
  onOpen: (product: Product, choice?: Record<string, string>) => void;
  onReserved: () => void;
  ownerId: string;
  readOnly: boolean;
}) => {
  const { data: product } = useProduct(item.productId);
  const image = product
    ? imageForChoice(product, item.variantChoice)
    : undefined;
  const title = product?.title ?? item.custom?.title ?? "…";
  const price = product
    ? formatPrice(product.priceMin, product.priceMax)
    : item.custom?.priceMin !== undefined
      ? formatPrice(item.custom.priceMin, item.custom.priceMax)
      : undefined;
  const variant = product ? describeVariant(product, item.variantChoice) : "";

  return (
    <li className="drop-shadow-[0_16px_18px_rgb(10_0_8/0.4)]">
      <article className="paper rounded-paper px-3 pt-[30px] pb-3.5 [mask:radial-gradient(circle_6px_at_50%_15px,#0000_96%,#000_100%)] before:border-paper-2 before:absolute before:top-[15px] before:left-1/2 before:-mt-2.5 before:-ml-2.5 before:size-5 before:rounded-full before:border-[2.5px] before:content-['']">
        <button
          type="button"
          disabled={!product}
          onClick={() => product && onOpen(product, item.variantChoice)}
          aria-label={product ? `Подробнее: ${title}` : title}
          className="bg-paper-2 relative grid aspect-[16/10] w-full place-items-center overflow-hidden rounded-[14px]"
        >
          {image ? (
            <img
              src={withBasePath(image.src)}
              alt={image.alt}
              className="absolute inset-0 size-full object-cover"
            />
          ) : (
            // Фото своих желаний в ссылку не попадают — бумажная заглушка.
            <Gift
              aria-hidden
              size={40}
              strokeWidth={1.5}
              className="text-ink-soft"
            />
          )}
        </button>
        <div className="px-1 pt-3">
          <h3 className="text-title-2">{title}</h3>
          {/* «Очень хочу» владельца видно и гостю (auto-tasks U05): такие
              желания и так стоят первыми — теперь понятно почему.
              «Мандарин-чернила», а не шампань: на бумаге шампань бледная. */}
          {item.priority === "top" && (
            <p className="text-caption text-mandarin-ink mt-1 flex items-center gap-1 font-semibold">
              <Star
                aria-hidden
                size={14}
                strokeWidth={1.75}
                className="fill-current"
              />
              Очень хочет
            </p>
          )}
          {price && <p className="text-price mt-1.5">{price}</p>}
          {variant && (
            <p className="text-caption text-ink-soft mt-1.5">
              Мне подойдёт: {variant}
            </p>
          )}
          {item.note && (
            <p className="text-title-3 border-paper-2 text-ink mt-2.5 border-l-2 pl-3">
              {item.note}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            {product &&
              storeOffers(product).map(({ label, offer }) => (
                <StoreTag key={label} href={offer.url}>
                  {label}
                </StoreTag>
              ))}
            {item.custom?.url && (
              <StoreTag href={item.custom.url}>Где купить</StoreTag>
            )}
          </div>
          {!readOnly && (
            <div className="mt-3.5">
              <ReserveControl
                ownerId={ownerId}
                itemKey={item.key}
                nameGuard={nameGuard}
                buy={buyLinkOf(item, product)}
                onReserved={onReserved}
              />
              {afterReserve && <div className="mt-2.5">{afterReserve}</div>}
            </div>
          )}
        </div>
      </article>
    </li>
  );
};

// Чужой вишлист глазами гостя (DESIGN.md §8.5): владелец, повод, сообщение и
// бирки с бронированием. Подаренных желаний здесь нет — их нет и в данных.
export const GuestWishlistView = ({
  wishlist,
  ownerId,
  ownerGender,
  footer,
  headerAction,
  readOnly = false,
  renderAfterReserve,
  titleAs: Title = "h1",
}: Props) => {
  const [details, setDetails] = useState<{
    choice?: Record<string, string>;
    product: Product;
  } | null>(null);
  // Карточка первой брони на этой странице и «Не сейчас».
  const [promoKey, setPromoKey] = useState<null | string>(null);
  const [promoDismissed, setPromoDismissed] = useState(false);
  const promo =
    renderAfterReserve && !promoDismissed
      ? renderAfterReserve(() => setPromoDismissed(true))
      : null;
  // Бронь от профиля без имени: одна NameSheet на весь список (DESIGN.md
  // §8.5). Гость без профиля называется только для брони — в ReserveControl.
  const requireName = useRequireName(NAME_CAPTIONS.reserve);

  return (
    <>
      <GuestWishlistHeader
        owner={wishlist.owner}
        occasion={wishlist.meta.occasion}
        message={wishlist.meta.message}
        ownerGender={ownerGender}
        titleAs={Title}
        action={headerAction}
      />
      {wishlist.items.length === 0 ? (
        <p className="text-body text-rose px-5 pt-6">
          Здесь пока пусто — желания ещё не добавлены.
        </p>
      ) : (
        <ul className="flex flex-col gap-4 px-5 pt-[18px] pb-6">
          {wishlist.items.map((item) => (
            <GuestWishCard
              key={item.key}
              item={item}
              ownerId={ownerId}
              readOnly={readOnly}
              nameGuard={requireName}
              onOpen={(product, choice) => setDetails({ product, choice })}
              onReserved={() => setPromoKey((key) => key ?? item.key)}
              afterReserve={promoKey === item.key ? promo : null}
            />
          ))}
        </ul>
      )}
      {footer}
      <ProductDetailsSheet
        product={details?.product ?? null}
        choice={details?.choice}
        onClose={() => setDetails(null)}
      />
      {requireName.sheet}
    </>
  );
};
