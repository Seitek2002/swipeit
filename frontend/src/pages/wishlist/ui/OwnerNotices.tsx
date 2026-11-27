"use client";

import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

import { imageForChoice, useProduct } from "@/entities/product";
import type { WishlistItem, WishlistResponse } from "@/entities/wishlist";

import {
  dismissGivenHint,
  updateWishlistMeta,
  wishlistKeys,
} from "@/shared/api";
import { withBasePath } from "@/shared/lib/base-path";
import { pluralize } from "@/shared/lib/format";
import { Button, IconButton, Switch, toast } from "@/shared/ui";

// Счётчик броней владельцу (DESIGN.md §8.3): кто и что выбрал — сюрприз,
// видно только количество, и его тоже можно скрыть.
export const ReservationNote = ({ data }: { data: WishlistResponse }) => {
  const queryClient = useQueryClient();
  const hidden = data.meta.hideReservationCount;
  const count = data.reservationCount ?? 0;

  const toggle = (next: boolean) => {
    updateWishlistMeta({ hideReservationCount: next })
      .then(() => queryClient.invalidateQueries({ queryKey: wishlistKeys.all }))
      .catch(() => toast("Не получилось сохранить", { tone: "error" }));
  };

  return (
    <div className="mx-5 mt-3.5">
      {!hidden && count > 0 && (
        <p className="text-caption text-rose" data-testid="reservation-count">
          {pluralize(count, ["подарок", "подарка", "подарков"])} уже кто-то
          выбрал
        </p>
      )}
      {/* Строка — вся зона нажатия, 44px; -my-1 оставляет в потоке прежние
          36px, чтобы отступы вокруг не выросли. */}
      <Switch
        className="-my-1"
        label="Скрыть, сколько уже выбрали"
        checked={hidden}
        onChange={toggle}
      />
    </div>
  );
};

const HintRow = ({
  item,
  onGiven,
}: {
  item: WishlistItem;
  onGiven: (item: WishlistItem) => void;
}) => {
  const { data: product } = useProduct(
    item.source.kind === "product" ? item.source.productId : undefined,
  );
  const image = product
    ? imageForChoice(product, item.variantChoice)
    : undefined;
  const title =
    item.source.kind === "custom"
      ? item.source.custom.title
      : (product?.title ?? "…");
  return (
    <li className="bg-paper-2 flex items-center gap-2.5 rounded-[14px] p-1.5">
      <div className="bg-paper size-11 flex-none overflow-hidden rounded-[10px]">
        {image && (
          <img
            src={withBasePath(image.src)}
            alt=""
            className="size-full object-cover"
          />
        )}
      </div>
      <p className="line-clamp-2 min-w-0 flex-1 text-[14px] leading-[18px] font-semibold">
        {title}
      </p>
      <Button
        size="sm"
        variant="secondary"
        className="px-3"
        onClick={() => onGiven(item)}
      >
        Да, подарили
      </Button>
    </li>
  );
};

const OCCASION_PAST: Record<string, string> = {
  birthday: "Прошёл твой день рождения.",
  new_year: "Прошёл Новый год.",
};

// Подсказка после повода (DESIGN.md §8.3, P1): повод прошёл, брони больше не
// секрет — «Возможно, тебе подарили это». «Да, подарили» открывает ту же
// шторку, что и пункт меню.
export const GivenHintBanner = ({
  data,
  onGiven,
}: {
  data: WishlistResponse;
  onGiven: (item: WishlistItem) => void;
}) => {
  const queryClient = useQueryClient();
  const hinted = data.items.filter((item) =>
    data.givenHintIds.includes(item.id),
  );
  if (hinted.length === 0) return null;

  const dismiss = () => {
    dismissGivenHint()
      .then(() => queryClient.invalidateQueries({ queryKey: wishlistKeys.all }))
      .catch(() => toast("Не получилось скрыть", { tone: "error" }));
  };

  return (
    <section
      aria-labelledby="given-hint-title"
      className="paper rounded-paper shadow-paper mx-5 mt-3.5 py-3.5 pr-1.5 pl-4"
    >
      <div className="flex items-start gap-1">
        <div className="flex-1 pt-0.5">
          <p id="given-hint-title" className="text-title-3">
            {OCCASION_PAST[data.meta.occasion?.kind ?? ""] ??
              "Повод уже прошёл."}
          </p>
          <p className="text-caption text-ink-soft mt-0.5">
            Возможно, тебе подарили это:
          </p>
        </div>
        <IconButton
          label="Скрыть подсказку"
          tone="on-paper"
          className="-mt-2.5"
          onClick={dismiss}
        >
          <X aria-hidden size={20} strokeWidth={1.75} />
        </IconButton>
      </div>
      <ul className="mt-2.5 flex flex-col gap-2 pr-2.5">
        {hinted.map((item) => (
          <HintRow key={item.id} item={item} onGiven={onGiven} />
        ))}
      </ul>
    </section>
  );
};
