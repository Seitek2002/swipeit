"use client";

import { type ReactNode, useState } from "react";

import { ExternalLink, Gift } from "lucide-react";

import { ProductDetailsSheet } from "@/features/product-details";
import { ReserveControl } from "@/features/reserve-gift";

import {
  type Product,
  describeVariant,
  imageForChoice,
  storeLabels,
  useProduct,
} from "@/entities/product";

import type { GuestWishlist } from "@/shared/api";
import { withBasePath } from "@/shared/lib/base-path";
import { formatPrice, genitive, occasionLabel } from "@/shared/lib/format";
import { Avatar, StoreTag } from "@/shared/ui";

type Item = GuestWishlist["items"][number];

type Props = {
  // Внизу страницы: «Собрать свой вишлист» у гостя по ссылке (T09).
  footer?: ReactNode;
  // Пол для «Вишлист Азамата»; у гостя по ссылке неизвестен.
  ownerGender?: "female" | "male";
  // Брони привязаны к id владельца (TECH_SPEC §5 Reservation.ownerId).
  ownerId: string;
  // Владелец смотрит свою ссылку «как друзья»: бронировать своё нельзя.
  readOnly?: boolean;
  wishlist: GuestWishlist;
};

// Бирка-карточка гостя (DESIGN.md §8.5, reference .g-card): крупнее, чем у
// владельца, — фото 16:10, вариант, заметка, магазины и бронь.
const GuestWishCard = ({
  item,
  ownerId,
  readOnly,
  onOpen,
}: {
  item: Item;
  onOpen: (product: Product) => void;
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
          onClick={() => product && onOpen(product)}
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
              storeLabels(product).map((store) => (
                <StoreTag key={store}>{store}</StoreTag>
              ))}
            {item.custom?.url && (
              <a
                href={item.custom.url}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-chip bg-paper-2 text-ink-soft inline-flex h-7 items-center gap-1 px-2.5 text-[13px] font-medium"
              >
                Где купить
                <ExternalLink aria-hidden size={14} strokeWidth={1.75} />
              </a>
            )}
          </div>
          {!readOnly && (
            <div className="mt-3.5">
              <ReserveControl ownerId={ownerId} itemKey={item.key} />
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
  readOnly = false,
}: Props) => {
  const [details, setDetails] = useState<null | Product>(null);
  const occasion = occasionLabel(wishlist.meta.occasion);

  return (
    <>
      <div className="px-5 pt-2.5 pb-1">
        <Avatar
          name={wishlist.owner.name}
          color={wishlist.owner.avatarColor}
          size={56}
        />
        <h1 className="text-title-1 mt-3.5">
          Вишлист {genitive(wishlist.owner.name, ownerGender)}
        </h1>
        {occasion && (
          <p className="text-title-3 text-rose mt-0.5">{occasion}</p>
        )}
        {wishlist.meta.message && (
          <p className="text-body bg-velvet-2 text-paper mt-3 rounded-[14px_14px_14px_4px] px-3.5 py-3">
            {wishlist.meta.message}
          </p>
        )}
      </div>
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
              onOpen={setDetails}
            />
          ))}
        </ul>
      )}
      {footer}
      <ProductDetailsSheet product={details} onClose={() => setDetails(null)} />
    </>
  );
};
