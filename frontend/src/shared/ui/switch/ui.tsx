"use client";

import { useId } from "react";

import { cn } from "@/shared/lib/utils";

type Props = {
  checked: boolean;
  className?: string;
  description?: string;
  disabled?: boolean;
  label: string;
  onChange: (checked: boolean) => void;
};

// Переключатель-строка: «Режим демонстрации», «Не показывать мне даже это»,
// «Скрыть цены от друга». Включённый — бумага, как выбранный чип: мандарин
// на экране остаётся у главной кнопки (DESIGN.md §1, принцип 2).
export const Switch = ({
  checked,
  onChange,
  label,
  description,
  disabled,
  className,
}: Props) => {
  const id = useId();
  return (
    <label
      htmlFor={id}
      className={cn(
        "flex min-h-11 cursor-pointer items-center gap-4",
        disabled && "cursor-default opacity-40",
        className,
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="text-body text-paper block">{label}</span>
        {description && (
          <span className="text-caption text-rose block">{description}</span>
        )}
      </span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "ease-out-soft relative h-7 w-12 flex-none rounded-full transition-colors duration-200",
          checked ? "bg-paper" : "bg-velvet-3",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "ease-out-soft absolute top-1 left-1 size-5 rounded-full transition-[transform,background-color] duration-200",
            checked ? "bg-velvet translate-x-5" : "bg-rose translate-x-0",
          )}
        />
      </button>
    </label>
  );
};
