"use client";

import { useProduct } from "@/entities/product";
import type { SantaWardItem } from "@/entities/santa-game";

import { formatPrice } from "@/shared/lib/format";
import { BottomSheet, Button } from "@/shared/ui";

// Название желания: товар — из каталога, своё — как подписал владелец.
const Option = ({
  item,
  onPick,
  disabled,
}: {
  disabled: boolean;
  item: SantaWardItem;
  onPick: () => void;
}) => {
  const { data: product } = useProduct(item.productId);
  const title = product?.title ?? item.custom?.title ?? "…";
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        onClick={onPick}
        className="border-line flex min-h-14 w-full items-center gap-3 border-b py-2 text-left"
      >
        <span className="text-body text-paper min-w-0 flex-1 font-semibold">
          {title}
        </span>
        {item.priceMin !== null && (
          <span className="text-caption text-rose flex-none">
            {formatPrice(item.priceMin, item.priceMax)}
          </span>
        )}
      </button>
    </li>
  );
};

// «Что купил?» (UX-аудит X02): выбранное желание бронируется обычной бронью
// — у гостей и других Сант оно занято, и два одинаковых подарка не выйдет.
// «Другое» — купил не из вишлиста: просто отметка.
export const BoughtSheet = ({
  open,
  items,
  pending,
  onClose,
  onPick,
}: {
  items: readonly SantaWardItem[];
  onClose: () => void;
  // itemKey или null — «Другое».
  onPick: (itemKey: null | string) => void;
  open: boolean;
  pending: boolean;
}) => {
  const choices = items.filter((item) => !item.reserved && !item.overBudget);
  return (
    <BottomSheet open={open} onClose={onClose} title="Что купил?">
      <p className="text-caption text-rose mb-2">
        Отметим это желание выбранным — друзья подопечного не купят второе такое
        же
      </p>
      <ul>
        {choices.map((item) => (
          <Option
            key={item.key}
            item={item}
            disabled={pending}
            onPick={() => onPick(item.key)}
          />
        ))}
      </ul>
      <Button
        variant="ghost"
        className="mt-2 w-full"
        loading={pending}
        onClick={() => onPick(null)}
      >
        Другое — не из вишлиста
      </Button>
    </BottomSheet>
  );
};
