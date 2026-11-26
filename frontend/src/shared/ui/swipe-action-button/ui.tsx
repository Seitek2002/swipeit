import type { CSSProperties, ComponentProps } from "react";

import { Heart, Star, Undo2, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";

export type SwipeAction = "like" | "pass" | "super" | "undo";

type Props = Omit<ComponentProps<"button">, "children"> & {
  action: SwipeAction;
  label?: string;
  // Прогресс жеста 0..1 для подсветки. Колода (T06) пишет его прямо в
  // CSS-переменную --p через ref, без ре-рендера на каждый кадр.
  progress?: number;
};

// DESIGN.md §7 SwipeActionButton: «Вернуть» 40px, «Мимо» 56px, «Очень хочу»
// 48px, «Хочу» 64px мандарином. При перетаскивании карточки соответствующая
// кнопка подсвечивается кольцом и увеличивается до 1.1 по прогрессу.
const styles: Record<SwipeAction, string> = {
  undo: "bg-velvet-2 text-rose size-10 before:absolute before:-inset-1 before:content-['']",
  pass: "bg-velvet-2 text-rose size-14 shadow-[0_0_0_calc(var(--p,0)*3px)_var(--color-rose)]",
  super:
    "bg-velvet-2 text-champagne size-12 shadow-[0_0_0_calc(var(--p,0)*3px)_var(--color-champagne)]",
  like: "bg-mandarin text-ink size-16 shadow-[0_12px_28px_-10px_rgb(255_138_61/0.7),0_0_0_calc(var(--p,0)*3px)_var(--color-mint)]",
};

const LABELS: Record<SwipeAction, string> = {
  undo: "Вернуть",
  pass: "Мимо",
  super: "Очень хочу",
  like: "Хочу",
};

const ICON_SIZE: Record<SwipeAction, number> = {
  undo: 20,
  pass: 24,
  super: 22,
  like: 26,
};

export const SwipeActionButton = ({
  action,
  label,
  progress,
  className,
  style,
  type = "button",
  ...props
}: Props) => {
  const size = ICON_SIZE[action];
  const vars =
    progress === undefined
      ? style
      : ({ ...style, "--p": progress } as CSSProperties);

  return (
    <button
      type={type}
      aria-label={label ?? LABELS[action]}
      style={vars}
      className={cn(
        "relative grid scale-[calc(1+var(--p,0)*0.1)] place-items-center rounded-full transition-[transform,opacity,box-shadow] duration-[120ms] active:scale-[0.94] disabled:pointer-events-none disabled:opacity-35",
        styles[action],
        className,
      )}
      {...props}
    >
      {action === "undo" && (
        <Undo2 aria-hidden size={size} strokeWidth={1.75} />
      )}
      {action === "pass" && <X aria-hidden size={size} strokeWidth={1.75} />}
      {action === "super" && (
        <Star
          aria-hidden
          size={size}
          strokeWidth={1.75}
          className="fill-champagne"
        />
      )}
      {action === "like" && (
        <Heart
          aria-hidden
          size={size}
          strokeWidth={1.75}
          className="fill-ink"
        />
      )}
    </button>
  );
};
