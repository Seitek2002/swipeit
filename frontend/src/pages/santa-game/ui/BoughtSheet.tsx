"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";

import { useProduct } from "@/entities/product";
import type { SantaView, SantaWardItem } from "@/entities/santa-game";

import { isApiError, santaKeys, setSantaBought } from "@/shared/api";
import { formatPrice } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { BottomSheet, Button, toast } from "@/shared/ui";

import {
  type BoughtChoice,
  type BoughtState,
  boughtStateOf,
  boughtToast,
  currentBought,
} from "../model/bought";

// Название желания: товар — из каталога, своё — как подписал владелец.
const Option = ({
  item,
  current,
  onPick,
  disabled,
}: {
  current: boolean;
  disabled: boolean;
  item: SantaWardItem;
  onPick: (title: string) => void;
}) => {
  const { data: product } = useProduct(item.productId);
  const title = product?.title ?? item.custom?.title ?? "…";
  return (
    <li>
      <button
        type="button"
        disabled={disabled}
        aria-pressed={current}
        onClick={() => onPick(title)}
        className="border-line flex min-h-14 w-full items-center gap-3 border-b py-2 text-left"
      >
        <span
          className={cn(
            "text-body min-w-0 flex-1 font-semibold",
            current ? "text-mint" : "text-paper",
          )}
        >
          {title}
        </span>
        {item.priceMin !== null && (
          <span className="text-caption text-rose flex-none">
            {formatPrice(item.priceMin, item.priceMax)}
          </span>
        )}
        {current && (
          <Check
            aria-hidden
            size={18}
            strokeWidth={2.25}
            className="text-mint flex-none"
          />
        )}
      </button>
    </li>
  );
};

// «Что купил?» (UX-аудит X02): выбранное желание бронируется обычной бронью
// — у гостей и других Сант оно занято, и два одинаковых подарка не выйдет.
// «Другое» — купил не из вишлиста: просто отметка. Открыта по «Изменить»
// (Y05) — текущий выбор отмечен галочкой, внизу «Подарка ещё нет — снять
// отметку»: промахнулся по строке — бронь не держит чужое желание до
// повода.
const BoughtSheet = ({
  open,
  items,
  current,
  pending,
  onClose,
  onPick,
  onUnmark,
}: {
  // Что отмечено сейчас: ключ желания, null — «Другое», undefined — ещё не
  // отмечено.
  current: null | string | undefined;
  items: readonly SantaWardItem[];
  onClose: () => void;
  onPick: (choice: BoughtChoice) => void;
  onUnmark: () => void;
  open: boolean;
  pending: boolean;
}) => {
  // Своё (reservedByMe) — в списке, даже если дороже бюджета: его и меняем.
  const choices = items.filter(
    (item) => item.reservedByMe || (!item.reserved && !item.overBudget),
  );
  const marked = current !== undefined;
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
            current={current === item.key}
            disabled={pending}
            onPick={(title) => onPick({ itemKey: item.key, title })}
          />
        ))}
      </ul>
      <Button
        variant="ghost"
        className={cn("mt-2 w-full", current === null && "text-mint")}
        aria-pressed={current === null}
        icon={
          current === null ? (
            <Check aria-hidden size={18} strokeWidth={2.25} />
          ) : undefined
        }
        disabled={pending}
        onClick={() => onPick({ itemKey: null, title: null })}
      >
        Другое — не из вишлиста
      </Button>
      {marked && (
        <Button
          variant="danger"
          className="w-full"
          disabled={pending}
          onClick={onUnmark}
        >
          Подарка ещё нет — снять отметку
        </Button>
      )}
    </BottomSheet>
  );
};

// Покупка в письме Санты (X02, Y05): «Отметить покупку подарка» или
// «Подарок куплен» с тихой «Изменить». После выбора — тост «Отмечено: …» с
// «Отменить» (5 с): возвращает прежнюю отметку и бронь.
export const BoughtSection = ({
  view,
  items,
}: {
  items: readonly SantaWardItem[];
  view: SantaView;
}) => {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const current = currentBought(view.me);
  const save = (next: SantaView) => {
    queryClient.setQueryData(santaKeys.detail(view.game.id), next);
    void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
  };
  const fail = (error: Error) =>
    toast(isApiError(error) ? error.message : "Не получилось сохранить", {
      tone: "error",
    });
  const send = (state: BoughtState) =>
    setSantaBought(view.game.id, state.bought, state.itemKey ?? undefined);

  // «Отменить» — вернуть как было до выбора, без второго «Отменить».
  const undo = useMutation({
    mutationFn: send,
    onSuccess: (next) => {
      save(next);
      toast("Вернули как было");
    },
    onError: fail,
  });
  const mark = useMutation({
    // before — отметка на момент нажатия: к ответу экран мог обновиться.
    mutationFn: ({
      state,
    }: {
      before: BoughtState;
      state: BoughtState;
      title: null | string;
    }) => send(state),
    onSuccess: (next, { before, state, title }) => {
      setOpen(false);
      save(next);
      toast(boughtToast(state, title), {
        action: { label: "Отменить", onClick: () => undo.mutate(before) },
      });
    },
    onError: fail,
  });

  const pick = (choice: BoughtChoice) => {
    // Тот же выбор — ничего не меняем.
    if (current !== undefined && choice.itemKey === current) {
      setOpen(false);
      return;
    }
    mark.mutate({
      before: boughtStateOf(current),
      state: { bought: true, itemKey: choice.itemKey },
      title: choice.title,
    });
  };

  return (
    <>
      {current === undefined ? (
        <Button size="lg" variant="secondary" onClick={() => setOpen(true)}>
          Отметить покупку подарка
        </Button>
      ) : (
        <div className="flex items-center justify-center gap-2">
          <p className="text-caption text-mint inline-flex items-center gap-1.5">
            <Check aria-hidden size={16} strokeWidth={2.25} />
            Подарок куплен
          </p>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Изменить покупку"
            onClick={() => setOpen(true)}
          >
            Изменить
          </Button>
        </div>
      )}
      <BoughtSheet
        open={open}
        items={items}
        current={current}
        pending={mark.isPending || undo.isPending}
        onClose={() => setOpen(false)}
        onPick={pick}
        onUnmark={() =>
          mark.mutate({
            before: boughtStateOf(current),
            state: { bought: false, itemKey: null },
            title: null,
          })
        }
      />
    </>
  );
};
