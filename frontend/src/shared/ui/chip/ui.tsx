import type { ComponentProps, ReactNode } from "react";

import { Check, ExternalLink, Lock, X } from "lucide-react";

import { cn } from "@/shared/lib/utils";

type Props = Omit<ComponentProps<"button">, "children"> & {
  children: ReactNode;
  icon?: ReactNode;
  // Фильтр заблокирован (ссылка-фильтр от друга, DESIGN.md §8.6): Lock, без X.
  locked?: boolean;
  // Чип активного фильтра с крестиком (DESIGN.md §8.2).
  onRemove?: () => void;
  removeLabel?: string;
  // Тогл: выбранный — бумага с «Чернилами» и Check слева. Не мандарин:
  // мандарин на экране один (DESIGN.md §1, принцип 2).
  selected?: boolean;
};

const base =
  "text-[14px] font-medium leading-none rounded-chip relative inline-flex h-9 flex-none items-center gap-1.5 whitespace-nowrap transition-[background-color,color] duration-200 ease-out-soft before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']";

// DESIGN.md §7 Chip: 36px, круглый, бархат-3; выбранный — бумага.
export const Chip = ({
  children,
  icon,
  selected,
  locked,
  onRemove,
  removeLabel,
  className,
  type = "button",
  onClick,
  ...props
}: Props) => {
  const isToggle = selected !== undefined;
  const isActive = Boolean(selected);

  if (onRemove || locked) {
    return (
      <span
        className={cn(
          base,
          "bg-velvet-3 text-paper pl-3.5",
          onRemove ? "pr-1" : "pr-3.5",
          className,
        )}
      >
        {locked && (
          <Lock
            aria-hidden
            size={14}
            strokeWidth={1.75}
            className="text-rose"
          />
        )}
        {icon}
        {children}
        {onRemove && !locked && (
          <button
            type="button"
            onClick={onRemove}
            aria-label={removeLabel ?? "Убрать"}
            className="text-rose relative grid size-7 place-items-center rounded-full before:absolute before:-inset-2 before:content-['']"
          >
            <X aria-hidden size={16} strokeWidth={1.75} />
          </button>
        )}
      </span>
    );
  }

  return (
    <button
      type={type}
      aria-pressed={isToggle ? isActive : undefined}
      onClick={onClick}
      className={cn(
        base,
        "px-3.5",
        isActive ? "bg-paper text-ink" : "bg-velvet-3 text-paper",
        className,
      )}
      {...props}
    >
      {isActive && <Check aria-hidden size={16} strokeWidth={2} />}
      {icon}
      {children}
    </button>
  );
};

const storeTagBase =
  "rounded-chip bg-paper-2 text-ink-soft inline-flex h-7 items-center px-2.5 text-[13px] leading-[18px] font-medium whitespace-nowrap";

// Чип-магазин на бирке: «Бумага-2» с «Чернилами-мягкими», только название
// текстом, без логотипов (DESIGN.md §7 Chip). С href — ссылка в магазин в
// новой вкладке с ExternalLink: серая плашка без значка не выглядит
// нажимаемой (UX-аудит 27.11.2026, M3). Зона нажатия — 44px по высоте.
export const StoreTag = ({
  children,
  className,
  href,
}: {
  children: ReactNode;
  className?: string;
  href?: string;
}) =>
  href ? (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className={cn(
        storeTagBase,
        "relative gap-1 before:absolute before:inset-x-0 before:-inset-y-2 before:content-['']",
        className,
      )}
    >
      {children}
      <ExternalLink aria-hidden size={14} strokeWidth={1.75} />
    </a>
  ) : (
    <span className={cn(storeTagBase, className)}>{children}</span>
  );
