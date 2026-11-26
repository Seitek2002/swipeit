import type { ComponentProps, ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

type Props = Omit<ComponentProps<"button">, "aria-label" | "children"> & {
  // Бейдж-число («Бумага» с «Чернилами», DESIGN.md §7 TabBar).
  badge?: number;
  children: ReactNode;
  // У кнопки только с иконкой подпись обязательна (DESIGN.md §5).
  label: string;
  tone?: "on-paper" | "on-velvet";
};

// Круглая кнопка-иконка 44×44 (минимальная зона нажатия, DESIGN.md §4).
export const IconButton = ({
  label,
  badge,
  tone = "on-velvet",
  className,
  children,
  type = "button",
  ...props
}: Props) => (
  <button
    type={type}
    aria-label={label}
    className={cn(
      "relative grid size-11 flex-none place-items-center rounded-full transition-transform duration-[120ms] active:scale-[0.94] disabled:pointer-events-none disabled:opacity-40",
      tone === "on-velvet" ? "text-paper" : "text-ink-soft",
      className,
    )}
    {...props}
  >
    {children}
    {badge !== undefined && badge > 0 && (
      <b className="text-micro bg-paper text-ink absolute top-1 right-0.5 h-[18px] min-w-[18px] rounded-[9px] px-[5px] text-center leading-[18px]">
        {badge}
      </b>
    )}
  </button>
);
