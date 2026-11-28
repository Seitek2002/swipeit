"use client";

import {
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useRef,
  useState,
} from "react";

import type { LucideIcon } from "lucide-react";
import {
  type PanInfo,
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from "motion/react";

import { cn } from "@/shared/lib/utils";

import { shouldOpenSwipeRow } from "./model";

export type SwipeRowAction = {
  icon: LucideIcon;
  // Уникален в строке: он же ключ кнопки.
  label: string;
  onClick: () => void;
  tone?: "danger" | "neutral";
};

type Props = {
  actions: SwipeRowAction[];
  children: ReactNode;
  className?: string;
  isOpen: boolean;
  // Какая строка открыта, держит список: открытой бывает только одна.
  onOpenChange: (open: boolean) => void;
};

// С элементов с атрибутом data-swipe-ignore (ручка перетаскивания) свайп
// не начинается.
const IGNORE_SELECTOR = "[data-swipe-ignore]";

// Пружина возврата карточки на место (DESIGN.md §6, spring-card).
const SPRING = { type: "spring", stiffness: 320, damping: 30 } as const;
const INSTANT = { duration: 0 } as const;

const TONES = {
  danger: "bg-pomegranate text-ink",
  neutral: "bg-velvet-3 text-paper",
} as const;

// Строка со свайп-действиями: тянешь влево — из-под неё выезжают кнопки,
// строка встаёт открытой целиком. Это второй путь к действиям: меню ⋮ в
// строке остаётся основным, в том числе для клавиатуры и скринридера, —
// поэтому закрытые кнопки вне фокуса и дерева доступности (inert).
export const SwipeRow = ({
  actions,
  children,
  className,
  isOpen,
  onOpenChange,
}: Props) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const actionsRef = useRef<HTMLDivElement>(null);
  // Жест сдвинул строку — клик после него не считается нажатием.
  const draggedRef = useRef(false);
  // Жест пошёл по вертикали — это прокрутка: строку не открываем, открытую
  // закрываем.
  const verticalRef = useRef(false);
  const [width, setWidth] = useState(0);
  const x = useMotionValue(0);
  const controls = useDragControls();
  const reducedMotion = Boolean(useReducedMotion());

  // Ширина блока действий — по факту отрисовки (шрифт, длина подписей).
  useEffect(() => {
    const node = actionsRef.current;
    if (!node) return;
    const measure = () => setWidth(node.getBoundingClientRect().width);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    animate(x, isOpen ? -width : 0, reducedMotion ? INSTANT : SPRING);
  }, [isOpen, width, reducedMotion, x]);

  // Открытую строку закрывает касание вне её и любая прокрутка.
  useEffect(() => {
    if (!isOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) onOpenChange(false);
    };
    const closeOnScroll = () => onOpenChange(false);
    document.addEventListener("pointerdown", closeOutside, true);
    window.addEventListener("scroll", closeOnScroll, true);
    return () => {
      document.removeEventListener("pointerdown", closeOutside, true);
      window.removeEventListener("scroll", closeOnScroll, true);
    };
  }, [isOpen, onOpenChange]);

  const handlePointerDown = (event: ReactPointerEvent) => {
    draggedRef.current = false;
    verticalRef.current = false;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if ((event.target as Element).closest(IGNORE_SELECTOR)) {
      // Взялись за ручку перетаскивания — открытую строку прячем.
      if (isOpen) onOpenChange(false);
      return;
    }
    controls.start(event);
  };

  const handleDragEnd = (_event: unknown, info: PanInfo) => {
    const open =
      !verticalRef.current &&
      shouldOpenSwipeRow({
        position: x.get(),
        velocity: info.velocity.x,
        wasOpen: isOpen,
        width,
      });
    // Анимируем сразу: если состояние не поменялось, эффект выше не
    // сработает, а строка не должна остаться наполовину открытой.
    animate(x, open ? -width : 0, reducedMotion ? INSTANT : SPRING);
    if (open !== isOpen) onOpenChange(open);
  };

  // Касание открытой строки закрывает её, а не открывает меню ⋮ или ссылку.
  const handleClickCapture = (event: ReactMouseEvent) => {
    // Клик с клавиатуры (detail 0) — не касание: меню ⋮ открывается как всегда.
    if (event.detail === 0) {
      if (isOpen) onOpenChange(false);
      return;
    }
    if (!isOpen && !draggedRef.current) return;
    event.preventDefault();
    event.stopPropagation();
    if (isOpen) onOpenChange(false);
  };

  return (
    <div
      ref={rootRef}
      // Мышью картинку в строке не утащить браузерным drag-and-drop.
      onDragStart={(event) => event.preventDefault()}
      className={cn("relative", className)}
    >
      <div
        ref={actionsRef}
        inert={!isOpen}
        className="absolute inset-y-0 right-0 flex items-center gap-1.5 pr-1 pl-3"
      >
        {actions.map(({ icon: Icon, label, onClick, tone = "neutral" }) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              onOpenChange(false);
              onClick();
            }}
            className="group flex w-[72px] flex-col items-center gap-1.5 py-1"
          >
            <span
              className={cn(
                "grid h-9 w-14 place-items-center rounded-2xl transition-transform duration-[120ms] group-active:scale-[0.96]",
                TONES[tone],
              )}
            >
              <Icon aria-hidden size={18} strokeWidth={1.75} />
            </span>
            <span className="text-caption text-rose whitespace-nowrap">
              {label}
            </span>
          </button>
        ))}
      </div>

      <motion.div
        drag="x"
        dragListener={false}
        dragControls={controls}
        dragDirectionLock
        onDirectionLock={(axis) => {
          // Вертикальный жест (прокрутка) открытую строку закрывает.
          verticalRef.current = axis === "y";
        }}
        dragConstraints={{ left: -width, right: 0 }}
        dragElastic={0.05}
        dragMomentum={false}
        style={{ x }}
        onPointerDown={handlePointerDown}
        onDragStart={() => {
          draggedRef.current = true;
        }}
        onDragEnd={handleDragEnd}
        onClickCapture={handleClickCapture}
        // Вертикальную прокрутку отдаём браузеру: свайп — только по X.
        className="relative touch-pan-y select-none"
      >
        {children}
      </motion.div>
    </div>
  );
};
