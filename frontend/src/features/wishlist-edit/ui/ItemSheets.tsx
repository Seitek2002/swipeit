"use client";

import { type ReactNode, useState } from "react";

import {
  ArrowDown,
  ArrowUp,
  Gift,
  HeartHandshake,
  type LucideIcon,
  NotebookPen,
  Palette,
  RotateCcw,
  Star,
  Trash2,
} from "lucide-react";

import { type Product, VariantPicker } from "@/entities/product";
import { useFriends } from "@/entities/user";
import { WishMiniTag, type WishlistItem } from "@/entities/wishlist";

import { clock, useClockOffset } from "@/shared/lib/clock";
import { toDateKey } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import {
  Avatar,
  BottomSheet,
  Button,
  Chip,
  TextArea,
  TextField,
} from "@/shared/ui";

import { useMarkGiven, useUpdateItem } from "../model";

export type ItemAction =
  | "delete"
  | "down"
  | "given"
  | "note"
  | "restore"
  | "thanks"
  | "top"
  | "up"
  | "variant";

// Что показать на мини-бирке в шторках: собирает страница (каталог + желание).
export type ItemDisplay = {
  imageSrc?: null | string;
  meta?: ReactNode;
  title: string;
  variant?: string;
};

type ActionRow = {
  action: ItemAction;
  danger?: boolean;
  icon: LucideIcon;
  label: string;
};

// Меню ⋮ (DESIGN.md §8.3): вариант, заметка, «Очень хочу», выше/ниже,
// «Мне это подарили», удалить. Во вкладке «Подарили» — вернуть и удалить.
export const ItemActionsSheet = ({
  item,
  display,
  hasVariants,
  canMoveUp,
  canMoveDown,
  onAction,
  onClose,
}: {
  canMoveDown: boolean;
  canMoveUp: boolean;
  display?: ItemDisplay;
  hasVariants: boolean;
  item: null | WishlistItem;
  onAction: (action: ItemAction, item: WishlistItem) => void;
  onClose: () => void;
}) => {
  const rows: ActionRow[] =
    item?.status === "given"
      ? [
          // Дарителя указал сам владелец — можно поблагодарить (P14).
          ...(item.given?.fromName
            ? [
                {
                  action: "thanks" as const,
                  icon: HeartHandshake,
                  label: "Сказать спасибо",
                },
              ]
            : []),
          { action: "restore", icon: RotateCcw, label: "Вернуть в вишлист" },
          { action: "delete", icon: Trash2, label: "Удалить", danger: true },
        ]
      : [
          ...(hasVariants
            ? [
                {
                  action: "variant" as const,
                  icon: Palette,
                  label: "Выбрать вариант",
                },
              ]
            : []),
          {
            action: "note",
            icon: NotebookPen,
            label: item?.note ? "Изменить заметку" : "Добавить заметку",
          },
          {
            action: "top",
            icon: Star,
            label:
              item?.priority === "top"
                ? "Убрать из «Очень хочу»"
                : "Очень хочу",
          },
          ...(canMoveUp
            ? [{ action: "up" as const, icon: ArrowUp, label: "Выше" }]
            : []),
          ...(canMoveDown
            ? [{ action: "down" as const, icon: ArrowDown, label: "Ниже" }]
            : []),
          { action: "given", icon: Gift, label: "Мне это подарили" },
          { action: "delete", icon: Trash2, label: "Удалить", danger: true },
        ];

  return (
    <BottomSheet
      open={item !== null}
      onClose={onClose}
      ariaLabel={display?.title ?? "Действия"}
    >
      {display && (
        <div className="mb-3">
          <WishMiniTag
            title={display.title}
            imageSrc={display.imageSrc}
            meta={display.meta}
          />
        </div>
      )}
      <div className="flex flex-col">
        {rows.map(({ action, icon: Icon, label, danger }) => (
          <button
            key={action}
            type="button"
            onClick={() => item && onAction(action, item)}
            className={cn(
              "border-line flex h-[52px] items-center gap-3.5 border-b px-1 text-left text-[16px] leading-[22px] font-medium last:border-b-0",
              danger ? "text-pomegranate" : "text-paper",
            )}
          >
            <Icon
              aria-hidden
              size={20}
              strokeWidth={1.75}
              className={danger ? "text-pomegranate" : "text-rose"}
            />
            {label}
          </button>
        ))}
      </div>
    </BottomSheet>
  );
};

// Заметка к желанию, до 140 символов.
export const NoteSheet = ({
  item,
  onClose,
}: {
  item: null | WishlistItem;
  onClose: () => void;
}) => {
  const updateItem = useUpdateItem();
  const [note, setNote] = useState("");
  const [forId, setForId] = useState<null | string>(null);
  if (item && item.id !== forId) {
    setForId(item.id);
    setNote(item.note ?? "");
  }

  return (
    <BottomSheet
      open={item !== null}
      onClose={onClose}
      title="Заметка"
      footer={
        <Button
          size="lg"
          onClick={() => {
            if (item) updateItem.mutate({ id: item.id, patch: { note } });
            onClose();
          }}
        >
          Сохранить
        </Button>
      }
    >
      <TextArea
        label="Что важно знать тому, кто будет дарить"
        placeholder="Например: лучше чёрный, у меня такой же чехол"
        maxLength={140}
        value={note}
        onChange={(event) => setNote(event.target.value)}
      />
    </BottomSheet>
  );
};

// Выбор варианта для желания из каталога («мне — чёрный, M»).
export const VariantSheet = ({
  item,
  product,
  onClose,
}: {
  item: null | WishlistItem;
  onClose: () => void;
  product?: Product;
}) => {
  const updateItem = useUpdateItem();
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [forId, setForId] = useState<null | string>(null);
  if (item && item.id !== forId) {
    setForId(item.id);
    setChoice(item.variantChoice ?? {});
  }

  return (
    <BottomSheet
      open={item !== null}
      onClose={onClose}
      title="Мне подойдёт"
      footer={
        <Button
          size="lg"
          onClick={() => {
            if (item)
              updateItem.mutate({
                id: item.id,
                patch: { variantChoice: choice },
              });
            onClose();
          }}
        >
          Сохранить
        </Button>
      }
    >
      {product?.variants && (
        <VariantPicker
          groups={product.variants}
          choice={choice}
          onChoose={(group, optionId) =>
            setChoice((current) => ({ ...current, [group.id]: optionId }))
          }
        />
      )}
    </BottomSheet>
  );
};

type Giver =
  | { kind: "friend"; name: string; userId: string }
  | { kind: "none" }
  | { kind: "other" };

// «Тебе это подарили?» (DESIGN.md §8.3): кто подарил — друг, другое имя или
// «Не помню»; дата — сегодня по умолчанию. Даритель указан — в тосте
// «Сказать спасибо» (onThanks, T28): та же шторка, что в меню ⋮.
export const GivenSheet = ({
  item,
  display,
  onClose,
  onThanks,
}: {
  display?: ItemDisplay;
  item: null | WishlistItem;
  onClose: () => void;
  // Название желания — для текста спасибо.
  onThanks?: (item: WishlistItem, title: string) => void;
}) => {
  const markGiven = useMarkGiven();
  const friends = useFriends();
  const today = toDateKey(clock.at(useClockOffset()));
  const [giver, setGiver] = useState<Giver>({ kind: "none" });
  const [otherName, setOtherName] = useState("");
  const [date, setDate] = useState(today);
  const [forId, setForId] = useState<null | string>(null);
  if (item && item.id !== forId) {
    setForId(item.id);
    setGiver({ kind: "none" });
    setOtherName("");
    setDate(today);
  }

  const handleConfirm = () => {
    if (!item) return;
    const title = display?.title ?? "";
    markGiven.mutate({
      id: item.id,
      onThanks: onThanks && ((given) => onThanks(given, title)),
      given: {
        at: new Date(`${date || today}T12:00:00`).toISOString(),
        fromUserId: giver.kind === "friend" ? giver.userId : undefined,
        fromName:
          giver.kind === "friend"
            ? giver.name
            : giver.kind === "other"
              ? otherName.trim() || undefined
              : undefined,
      },
    });
    onClose();
  };

  return (
    <BottomSheet
      open={item !== null}
      onClose={onClose}
      title="Тебе это подарили?"
      footer={
        <Button size="lg" onClick={handleConfirm}>
          Перенести в «Подарили»
        </Button>
      }
    >
      {display && (
        <WishMiniTag
          title={display.title}
          imageSrc={display.imageSrc}
          meta={display.meta}
          variant={display.variant}
        />
      )}
      <p className="text-caption text-rose mt-5 mb-2">Кто подарил</p>
      <div className="no-scrollbar -mx-5 flex gap-1 overflow-x-auto px-4 pb-1">
        {friends.data?.map(({ user }) => {
          const selected = giver.kind === "friend" && giver.userId === user.id;
          return (
            <button
              key={user.id}
              type="button"
              aria-pressed={selected}
              onClick={() =>
                setGiver({ kind: "friend", userId: user.id, name: user.name })
              }
              className="flex w-16 flex-none flex-col items-center gap-1.5 py-1"
            >
              <Avatar
                name={user.name}
                color={user.avatarColor}
                size={44}
                decorative
                className={cn(
                  "ease-out-soft transition-shadow duration-200",
                  selected &&
                    "shadow-[0_0_0_2px_var(--color-velvet-2),0_0_0_4px_var(--color-paper)]",
                )}
              />
              <span
                className={cn(
                  "text-caption truncate",
                  selected ? "text-paper" : "text-rose",
                )}
              >
                {user.name}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip
          selected={giver.kind === "other"}
          onClick={() => setGiver({ kind: "other" })}
        >
          Другое имя
        </Chip>
        <Chip
          selected={giver.kind === "none"}
          onClick={() => setGiver({ kind: "none" })}
        >
          Не помню
        </Chip>
      </div>
      {giver.kind === "other" && (
        <div className="mt-3">
          <TextField
            label="Имя"
            autoFocus
            maxLength={40}
            value={otherName}
            onChange={(event) => setOtherName(event.target.value)}
          />
        </div>
      )}
      <div className="mt-5">
        <TextField
          label="Когда"
          type="date"
          max={today}
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </div>
    </BottomSheet>
  );
};
