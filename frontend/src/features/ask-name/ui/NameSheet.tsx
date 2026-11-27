"use client";

import { useState } from "react";

import { NetworkPlaque, useMe, useUpdateMe } from "@/entities/user";

import { AVATAR_COLORS, type AvatarColor } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Avatar, BottomSheet, Button, TextField } from "@/shared/ui";

import { NAME_MAX } from "../model";

const COLOR_LABELS: Record<AvatarColor, string> = {
  plum: "Слива",
  mandarin: "Мандарин",
  mint: "Мята",
  champagne: "Шампань",
  rose: "Роза",
  pomegranate: "Гранат",
  graphite: "Графит",
  olive: "Олива",
};

type Props = {
  // Подпись по месту (DESIGN.md §7 NameSheet): имя подставляется по мере
  // ввода — «Друзья увидят: „Вишлист Айгерим“».
  caption: (name: string) => string;
  onClose: () => void;
  onSaved: () => void;
  open: boolean;
};

// «Как тебя зовут?» (DESIGN.md §7 NameSheet, эталон — кадр 3 quick-start.html):
// имя спрашиваем только там, где его увидят другие. Закрыли без имени —
// действие отменяется.
export const NameSheet = ({ open, onClose, onSaved, caption }: Props) => (
  <BottomSheet open={open} onClose={onClose} title="Как тебя зовут?">
    {open && <NameForm caption={caption} onSaved={onSaved} />}
  </BottomSheet>
);

// Сама форма — для шторок, где имя — первый шаг внутри (DESIGN.md §8.4 шаг 1:
// «Отправить вишлист»). После сохранения профиль в кэше уже с именем.
export const NameForm = ({
  caption,
  onSaved,
}: {
  caption: (name: string) => string;
  onSaved?: () => void;
}) => {
  const me = useMe();
  const updateMe = useUpdateMe();
  const [name, setName] = useState("");
  const [color, setColor] = useState<AvatarColor | null>(null);
  const avatarColor: AvatarColor = color ?? me.data?.avatarColor ?? "mandarin";
  const trimmed = name.trim();

  const submit = () => {
    if (!trimmed || updateMe.isPending) return;
    updateMe.mutate({ name: trimmed, avatarColor }, { onSuccess: onSaved });
  };

  return (
    <div className="flex flex-col gap-4 pb-1">
      <p className="text-caption text-rose">{caption(trimmed || "…")}</p>
      <div className="flex items-start gap-3">
        <Avatar name={trimmed} color={avatarColor} size={48} decorative />
        <div className="min-w-0 flex-1">
          <TextField
            aria-label="Имя"
            autoFocus
            autoComplete="given-name"
            enterKeyHint="done"
            maxLength={NAME_MAX}
            value={name}
            onChange={(event) => setName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") submit();
            }}
            error={
              updateMe.isError
                ? "Не получилось сохранить. Попробуй ещё раз"
                : undefined
            }
          />
        </div>
      </div>
      {/* Колонки не уже 44px (зона нажатия, DESIGN §4): 8 × 44 не помещается
          на 360px — там последний кружок уходит на вторую строку, а где
          помещается, кружки делят ширину поровну. */}
      <div
        role="radiogroup"
        aria-label="Цвет аватара"
        className="-mx-1 grid grid-cols-[repeat(auto-fit,minmax(44px,1fr))]"
      >
        {AVATAR_COLORS.map((option) => {
          const selected = option === avatarColor;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={COLOR_LABELS[option]}
              onClick={() => setColor(option)}
              className="grid h-11 place-items-center"
            >
              <Avatar
                plain
                color={option}
                size={32}
                decorative
                className={cn(
                  "ease-out-soft transition-shadow duration-200",
                  selected &&
                    "shadow-[0_0_0_2px_var(--color-velvet-2),0_0_0_4px_var(--color-paper)]",
                )}
              />
            </button>
          );
        })}
      </div>
      <NetworkPlaque />
      <Button
        size="lg"
        disabled={!trimmed}
        loading={updateMe.isPending}
        onClick={submit}
      >
        Продолжить
      </Button>
    </div>
  );
};
