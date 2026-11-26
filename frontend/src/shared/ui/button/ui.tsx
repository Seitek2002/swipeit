import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

import { Spinner } from "../spinner";

export type ButtonVariant =
  "danger" | "ghost" | "paper" | "primary" | "secondary";
export type ButtonSize = "lg" | "md" | "sm";

// DESIGN.md §7 Button. Мандарин — только главное действие экрана; поверх
// бархатных шторок, где мандарин уже занят, — «бумажная» кнопка.
const variants: Record<ButtonVariant, string> = {
  primary:
    "bg-mandarin text-ink shadow-[0_10px_24px_-10px_rgb(255_138_61/0.6)]",
  secondary: "bg-velvet-3 text-paper",
  ghost: "text-rose",
  danger: "text-pomegranate",
  paper: "bg-paper text-ink",
};

// sm визуально 36px, но зона нажатия 44px — за счёт невидимого ::before.
const sizes: Record<ButtonSize, string> = {
  lg: "h-14 w-full px-[22px]",
  md: "h-12 px-[22px]",
  sm: "h-9 rounded-field px-3.5 before:absolute before:-inset-1 before:content-['']",
};

const base =
  "text-label rounded-chip relative inline-flex items-center justify-center gap-2 whitespace-nowrap transition-[transform,opacity] duration-[120ms] select-none active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40 disabled:shadow-none aria-disabled:pointer-events-none aria-disabled:opacity-40 aria-disabled:shadow-none";

// Классы кнопки отдельно — для ссылок, которые выглядят как кнопки (<Link>).
export const buttonClassName = ({
  variant = "primary",
  size = "md",
  className,
}: {
  className?: string;
  size?: ButtonSize;
  variant?: ButtonVariant;
}) => cn(base, variants[variant], sizes[size], className);

type Props = ComponentProps<"button"> & {
  icon?: ReactNode;
  loading?: boolean;
  size?: ButtonSize;
  variant?: ButtonVariant;
};

// Текст кнопки — глагол, что произойдёт (DESIGN.md §9). При loading текст
// остаётся в разметке невидимым, поэтому ширина кнопки не прыгает.
export const Button = ({
  variant = "primary",
  size = "md",
  loading = false,
  icon,
  className,
  children,
  disabled,
  type = "button",
  ...props
}: Props) => (
  <button
    type={type}
    disabled={disabled || loading}
    aria-busy={loading || undefined}
    // Загрузка — не «неактивно»: кнопка не тускнеет, только не нажимается.
    className={buttonClassName({
      variant,
      size,
      className: cn(loading && "disabled:opacity-100", className),
    })}
    {...props}
  >
    <span
      className={cn("inline-flex items-center gap-2", loading && "invisible")}
    >
      {icon}
      {children}
    </span>
    {loading && <Spinner className="absolute size-5" />}
  </button>
);
