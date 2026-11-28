"use client";

import { type ReactNode, useState } from "react";

import { CalendarPlus, Gift, Star } from "lucide-react";

import { NAME_CAPTIONS, useRequireName } from "@/features/ask-name";
import {
  buildIcs,
  downloadIcs,
  giftReminderDay,
} from "@/features/calendar-export";
import { ProductDetailsSheet } from "@/features/product-details";
import {
  type BuyLink,
  type NameGuard,
  type ReserveAccess,
  ReserveActionButton,
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
  useProducts,
  useRemovedProductIds,
  withoutRemovedProducts,
} from "@/entities/product";

import type { GuestWishlist } from "@/shared/api";
import { withBasePath } from "@/shared/lib/base-path";
import { clock } from "@/shared/lib/clock";
import { useCustomImageUrl } from "@/shared/lib/dom";
import { formatPrice } from "@/shared/lib/format";
import { Chip, StoreTag } from "@/shared/ui";

import { type BudgetLimit, budgetChips, fitsBudget } from "../model/budget";
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
  // Гость по короткой ссылке (remote): код для броней без дружбы и
  // перечитывание броней раз в 30 секунд (B15).
  access?: ReserveAccess;
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
  // Гость по ссылке: после брони в демо — «Скопировать для чата» (X01).
  // У демо-друзей из списка сказать о брони некому.
  reservationChat?: boolean;
  // Под шапкой со своим h1 (профиль друга) — h2, на странице ссылки — h1.
  titleAs?: "h1" | "h2";
  wishlist: GuestWishlist;
};

// «В календарь» после брони (P07): событие на весь день за 3 дня до повода —
// успеть купить. В описании — ссылка в магазин. В ряду кнопок брони (Y10).
const CalendarReminder = ({
  date,
  title,
  url,
}: {
  date: string;
  title: string;
  url?: string;
}) => (
  <ReserveActionButton
    className="text-ink-soft"
    onClick={() => {
      const now = clock.now();
      downloadIcs(
        "swipeit-gift.ics",
        buildIcs(
          {
            uid: `gift-${date}-${title.length}-${now}`,
            title,
            start: giftReminderDay(date, now),
            allDay: true,
            durationMinutes: 60,
            description: url ? `Где купить: ${url}` : "Подарок из вишлиста",
          },
          now,
        ),
      );
    }}
  >
    <CalendarPlus aria-hidden size={20} strokeWidth={2} />В календарь
  </ReserveActionButton>
);

// Бирка-карточка гостя (DESIGN.md §8.5, reference .g-card): крупнее, чем у
// владельца, — фото 16:10, вариант, заметка, магазины и бронь.
const GuestWishCard = ({
  access,
  item,
  ownerId,
  readOnly,
  nameGuard,
  onOpen,
  onReserved,
  afterReserve,
  occasionDate,
  ownerName,
  reservationChat,
}: {
  access?: ReserveAccess;
  afterReserve?: ReactNode;
  item: Item;
  nameGuard: NameGuard;
  // Дата повода ("YYYY-MM-DD") и имя владельца — для «Напомнить в
  // календаре» после брони (P07). Нет даты — ссылки нет.
  occasionDate?: string;
  onOpen: (product: Product, choice?: Record<string, string>) => void;
  onReserved: () => void;
  ownerId: string;
  ownerName: string;
  readOnly: boolean;
  reservationChat: boolean;
}) => {
  const { data: product } = useProduct(item.productId);
  const image = product
    ? imageForChoice(product, item.variantChoice)
    : undefined;
  // Фото своего желания приходит только в живом вишлисте с сервера
  // (imageKey, remote): в длинной ссылке его нет.
  const customImage = useCustomImageUrl(item.custom?.imageKey);
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
        {/* Фото слева, текст справа (UX-аудит W07): с фото на всю ширину
            бирка была 450 px — на 360×640 первая «Забронирую я» уходила под
            сгиб, а 10 желаний — это 10 экранов. На низком экране фото
            96 px, иначе 120 px. */}
        <div className="flex items-start gap-3">
          <button
            type="button"
            disabled={!product}
            onClick={() => product && onOpen(product, item.variantChoice)}
            aria-label={product ? `Подробнее: ${title}` : title}
            className="bg-paper-2 relative grid size-[120px] flex-none place-items-center overflow-hidden rounded-[14px] [@media(max-height:700px)]:size-24"
          >
            {image ? (
              <img
                src={withBasePath(image.src)}
                alt={image.alt}
                className="absolute inset-0 size-full object-cover"
              />
            ) : customImage ? (
              <img
                src={customImage}
                alt=""
                className="absolute inset-0 size-full object-cover"
              />
            ) : (
              // Своё желание без фото или из длинной ссылки — бумажная
              // заглушка.
              <Gift
                aria-hidden
                size={32}
                strokeWidth={1.5}
                className="text-ink-soft"
              />
            )}
          </button>
          <div className="min-w-0 flex-1 pt-0.5">
            <h3 className="text-title-3 line-clamp-3">{title}</h3>
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
            {price && <p className="text-price mt-1">{price}</p>}
            {variant && (
              <p className="text-caption text-ink-soft mt-1">
                В вишлисте: {variant}
              </p>
            )}
          </div>
        </div>
        <div className="px-1">
          {item.note && (
            <p className="text-body border-paper-2 text-ink mt-3 border-l-2 pl-3">
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
                access={access}
                ownerId={ownerId}
                itemKey={item.key}
                nameGuard={nameGuard}
                buy={buyLinkOf(item, product)}
                onReserved={onReserved}
                // Название — когда товар из каталога уже пришёл: «…» в
                // тексте для чата никому не поможет.
                chat={
                  reservationChat && (product || item.custom)
                    ? { ownerName, title }
                    : undefined
                }
                afterBuy={
                  occasionDate ? (
                    <CalendarReminder
                      date={occasionDate}
                      // Без падежей имени: «для Азамат» было бы с ошибкой.
                      title={`Купить подарок: ${title} (вишлист: ${ownerName})`}
                      url={buyLinkOf(item, product)?.href}
                    />
                  ) : null
                }
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
  access,
  wishlist,
  ownerId,
  ownerGender,
  footer,
  headerAction,
  readOnly = false,
  renderAfterReserve,
  reservationChat = false,
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

  // Фильтр по бюджету (auto-tasks P10): цены товаров — из каталога, своих
  // желаний — из самих желаний.
  const productIds = wishlist.items.flatMap((item) =>
    item.productId ? [item.productId] : [],
  );
  const products = useProducts(productIds);
  // Товар убрали из каталога (S07) — желание гостю не показываем, как
  // подаренное: купить его негде.
  const removedIds = useRemovedProductIds(productIds);
  const visible = withoutRemovedProducts(wishlist.items, removedIds);
  const priceOf = (item: Item) =>
    (item.productId ? products.get(item.productId)?.priceMin : undefined) ??
    item.custom?.priceMin;
  const chips = budgetChips(visible.map(priceOf));
  const [limit, setLimit] = useState<BudgetLimit | null>(null);
  const shownLimit = limit !== null && chips.includes(limit) ? limit : null;
  const items = visible.filter((item) => fitsBudget(priceOf(item), shownLimit));

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
      {chips.length > 0 && (
        <div
          role="group"
          aria-label="Бюджет"
          className="no-scrollbar flex gap-2 overflow-x-auto px-5 pt-3.5"
        >
          <Chip selected={shownLimit === null} onClick={() => setLimit(null)}>
            Все
          </Chip>
          {chips.map((value) => (
            <Chip
              key={value}
              selected={shownLimit === value}
              onClick={() => setLimit(value)}
            >
              до {formatPrice(value)}
            </Chip>
          ))}
        </div>
      )}
      {visible.length === 0 ? (
        <p className="text-body text-rose px-5 pt-6">
          Здесь пока пусто — желания ещё не добавлены.
        </p>
      ) : (
        <ul className="flex flex-col gap-4 px-5 pt-[18px] pb-6">
          {items.map((item) => (
            <GuestWishCard
              key={item.key}
              access={access}
              item={item}
              ownerId={ownerId}
              readOnly={readOnly}
              nameGuard={requireName}
              onOpen={(product, choice) => setDetails({ product, choice })}
              onReserved={() => setPromoKey((key) => key ?? item.key)}
              occasionDate={wishlist.meta.occasion?.date}
              ownerName={wishlist.owner.name}
              reservationChat={reservationChat}
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
