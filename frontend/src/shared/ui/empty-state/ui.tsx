import type { ReactNode } from "react";

import { cn } from "@/shared/lib/utils";

type PaperObject = "envelope" | "tag" | "ticket";

type Props = {
  action?: ReactNode;
  className?: string;
  // Пояснение под фразой — когда фраза стала заголовком («Сессия
  // закончилась» + что это значит, S07). Обычно не нужно: одна фраза.
  description?: string;
  // Мелкая строка под кнопкой: код ошибки для владельца (S08).
  footer?: ReactNode;
  object?: PaperObject;
  title: string;
};

// Бумажный предмет функции «в линию» (DESIGN.md §7 EmptyState): пустая бирка,
// билетик или конверт. Линии — пыльная роза, как в reference.html (.empty-obj).
const OBJECTS: Record<PaperObject, ReactNode> = {
  tag: (
    <svg viewBox="0 0 120 150" className="h-[150px] w-[120px]">
      <rect x="1" y="1" width="118" height="148" rx="18" />
      <circle cx="60" cy="21" r="7" />
    </svg>
  ),
  ticket: (
    <svg viewBox="0 0 150 110" className="h-[110px] w-[150px]">
      <path d="M19 1h112a18 18 0 0 1 18 18v27a9 9 0 0 0 0 18v27a18 18 0 0 1-18 18H19A18 18 0 0 1 1 91V64a9 9 0 0 0 0-18V19A18 18 0 0 1 19 1z" />
      <path d="M22 55h106" strokeDasharray="4 6" />
    </svg>
  ),
  envelope: (
    <svg viewBox="0 0 160 110" className="h-[110px] w-[160px]">
      <rect x="1" y="1" width="158" height="108" rx="12" />
      <path d="M2 4l78 56 78-56" />
      <circle cx="80" cy="60" r="12" />
    </svg>
  ),
};

// Пустой экран — приглашение к действию: одна фраза и одна кнопка (DESIGN.md §9).
export const EmptyState = ({
  object = "tag",
  title,
  description,
  action,
  className,
  footer,
}: Props) => (
  <div
    className={cn(
      "flex flex-col items-center justify-center gap-4 px-6 text-center",
      className,
    )}
  >
    <span
      aria-hidden
      className="stroke-rose fill-none opacity-80 [&_svg]:overflow-visible [&_svg]:stroke-2"
    >
      {OBJECTS[object]}
    </span>
    {description ? (
      <div className="flex flex-col gap-2">
        <p className="text-title-2 text-paper">{title}</p>
        <p className="text-body text-rose max-w-[30ch]">{description}</p>
      </div>
    ) : (
      <p className="text-body-lg text-paper max-w-[28ch]">{title}</p>
    )}
    {action && (
      <div className="mt-1 flex w-full max-w-[260px] flex-col gap-2">
        {action}
      </div>
    )}
    {footer && <div className="text-paper">{footer}</div>}
  </div>
);
