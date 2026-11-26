"use client";

import { type PointerEvent, type ReactNode, useId, useRef } from "react";

import {
  AnimatePresence,
  type PanInfo,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from "motion/react";

import { useFocusTrap } from "@/shared/lib/useFocusTrap";
import { useScrollLock } from "@/shared/lib/useScrollLock";
import { cn } from "@/shared/lib/utils";

import { OverlayPortal } from "../portal";

type Props = {
  // Подпись для скринридера, если видимого заголовка нет.
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  // Липкий футер для главной кнопки (с учётом safe-area).
  footer?: ReactNode;
  // Что-то справа от заголовка (кнопка «Сбросить» и т. п.).
  headerExtra?: ReactNode;
  // auto — по контенту (до 90% высоты), full — всегда 90%.
  height?: "auto" | "full";
  onClose: () => void;
  open: boolean;
  title?: ReactNode;
};

// DESIGN.md §6 токен sheet: вход 340ms ease-out-soft, выход 220ms ease-in-quick.
const EASE_OUT_SOFT = [0.16, 1, 0.3, 1] as const;
const EASE_IN_QUICK = [0.4, 0, 1, 1] as const;
// Порог закрытия свайпом вниз (DESIGN.md §7 BottomSheet).
const CLOSE_SHARE = 0.25;
const CLOSE_VELOCITY = 500;

// Шторка (DESIGN.md §7). Сделана заново на основе мобильной ветки Modal из
// imbir со всеми доработками: язычок и закрытие свайпом вниз, тап по фону,
// Escape, role="dialog" + aria-modal + aria-labelledby, ловушка фокуса и
// возврат фокуса, блокировка прокрутки со счётчиком (две шторки друг над
// другом не снимают блокировку друг у друга), липкий футер, две высоты.
export const BottomSheet = (props: Props) => (
  <OverlayPortal>
    <AnimatePresence>{props.open && <SheetPanel {...props} />}</AnimatePresence>
  </OverlayPortal>
);

const SheetPanel = ({
  title,
  ariaLabel,
  headerExtra,
  footer,
  height = "auto",
  onClose,
  className,
  children,
}: Props) => {
  const titleId = useId();
  const sheetRef = useRef<HTMLDivElement>(null);
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  // Фон тускнеет вместе с тем, как шторку тянут вниз.
  const dragFade = useMotionValue(1);

  useScrollLock(true);
  const handleKeyDown = useFocusTrap(sheetRef, true, onClose);

  const enter = reduceMotion
    ? { duration: 0 }
    : { duration: 0.34, ease: EASE_OUT_SOFT };
  const exit = reduceMotion
    ? { duration: 0 }
    : { duration: 0.22, ease: EASE_IN_QUICK };

  const startDrag = (event: PointerEvent<HTMLElement>) => {
    if ((event.target as HTMLElement).closest("button, a, input")) return;
    dragControls.start(event);
  };

  const handleDrag = (_: unknown, info: PanInfo) => {
    const sheetHeight = sheetRef.current?.offsetHeight ?? 1;
    dragFade.set(1 - Math.max(0, info.offset.y) / sheetHeight);
  };

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    const sheetHeight = sheetRef.current?.offsetHeight ?? 1;
    if (
      info.offset.y > sheetHeight * CLOSE_SHARE ||
      info.velocity.y > CLOSE_VELOCITY
    ) {
      onClose();
    } else {
      dragFade.set(1);
    }
  };

  return (
    <div className="absolute inset-0 z-[100]">
      <motion.div
        aria-hidden
        className="absolute inset-0"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1, transition: enter }}
        exit={{ opacity: 0, transition: exit }}
        onClick={onClose}
      >
        <motion.div
          className="absolute inset-0 bg-[rgb(10_0_8/0.55)]"
          style={{ opacity: dragFade }}
        />
      </motion.div>

      <motion.div
        ref={sheetRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : ariaLabel}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        className={cn(
          "bg-velvet-2 rounded-t-sheet absolute inset-x-0 bottom-0 flex flex-col shadow-[0_-24px_60px_-12px_rgb(10_0_8/0.7),0_-1px_0_var(--color-line)] outline-none",
          height === "full" ? "h-[90%]" : "max-h-[90%]",
          className,
        )}
        initial={{ y: "100%" }}
        animate={{ y: 0, transition: enter }}
        exit={{ y: "100%", transition: exit }}
        drag="y"
        dragControls={dragControls}
        dragListener={false}
        dragConstraints={{ top: 0, bottom: 0 }}
        dragElastic={{ top: 0, bottom: 1 }}
        dragSnapToOrigin
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
      >
        <div
          aria-hidden
          onPointerDown={startDrag}
          className="flex flex-none cursor-grab touch-none justify-center pt-2.5 pb-2"
        >
          <span className="h-1 w-9 rounded-full bg-[rgb(255_241_243/0.28)]" />
        </div>

        {title && (
          <div
            onPointerDown={startDrag}
            className="flex flex-none touch-none items-center gap-3 px-5 pt-0.5 pb-3.5"
          >
            <h2 id={titleId} className="text-title-2 min-w-0 flex-1">
              {title}
            </h2>
            {headerExtra}
          </div>
        )}

        <div className="no-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">
          {children}
        </div>

        {footer && (
          <div className="border-line flex flex-none flex-col gap-2 border-t px-5 pt-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
            {footer}
          </div>
        )}
      </motion.div>
    </div>
  );
};
