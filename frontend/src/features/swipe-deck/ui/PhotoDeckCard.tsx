"use client";

import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  createContext,
  use,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
} from "react";

import {
  type AnimationPlaybackControls,
  type MotionValue,
  animate,
  motion,
  useMotionValue,
  useMotionValueEvent,
  useTransform,
} from "motion/react";

import { vibrate } from "@/shared/lib/dom";

import {
  PHOTO_DISTANCE,
  PHOTO_FLY_DURATION,
  PHOTO_FLY_X,
  PHOTO_FLY_Y,
  SPRING_PHOTO_BACK,
  SPRING_PHOTO_ENTER,
  type Sample,
  type SwipeDirection,
  decidePhotoDirection,
  lockAxis,
  photoProgress,
  photoRotation,
  scrollProgressFor,
  velocityOf,
} from "../model";

// Что движок отдаёт фото-карточке: отклик на жест, прогресс прокрутки и
// действия для кнопок внутри карточки (DESIGN.md §7 GiftCard).
export type PhotoCardState = {
  canUndo: boolean;
  disabled: boolean;
  isTop: boolean;
  // Прокрутка карточки 0..1 (на 120px) — по ней кнопки перетекают в бумагу.
  scrollProgress: MotionValue<number>;
  scrollToDetails: () => void;
  swipe: (direction: SwipeDirection) => void;
  undo: () => void;
  // 1 — карточка улетает вверх кнопкой «Очень хочу».
  up: MotionValue<number>;
  // Сдвиг карточки — для вуали и круга-отклика.
  x: MotionValue<number>;
};

const PhotoCardContext = createContext<null | PhotoCardState>(null);

// Состояние фото-карточки для её содержимого: отклик, прокрутка, кнопки.
export const usePhotoCard = (): PhotoCardState => {
  const state = use(PhotoCardContext);
  if (!state) throw new Error("usePhotoCard вне карточки колоды");
  return state;
};

export type PhotoCardApi = {
  // Прокрутить карточку с клавиатуры (↓, PageDown, Home…).
  element: () => HTMLDivElement | null;
  scrollToDetails: () => void;
  swipe: (direction: SwipeDirection) => void;
};

type Props = {
  canUndo: boolean;
  children: ReactNode;
  depth: number;
  description?: string;
  disabled: boolean;
  // Карточку вернули «Отменой» — прилетает с той стороны, куда ушла.
  enterFrom?: SwipeDirection;
  isBusyRef: RefObject<boolean>;
  label: string;
  onCommit: (direction: SwipeDirection) => void;
  onRegister: (api: null | PhotoCardApi) => void;
  onUndo: () => void;
  // Сдвиг верхней 0..1 к порогу: по нему поднимается следующая карточка.
  progress: MotionValue<number>;
  reducedMotion: boolean;
};

type Drag = {
  axis: "x" | "y" | null;
  crossed: boolean;
  id: number;
  samples: Sample[];
  startX: number;
  startY: number;
};

// Фото-карточка колоды подарков (DESIGN.md §6 «Колода подарков», как в
// tap-tap): сама карточка — контейнер прокрутки к подробностям, жест — только
// по горизонтали. Ось решается по первым 10px: больше по Y — это прокрутка, и
// карточка не двигается. Позиция и отклик — motion values, без ре-рендеров.
export const PhotoDeckCard = ({
  children,
  depth,
  label,
  description,
  progress,
  isBusyRef,
  disabled,
  reducedMotion,
  enterFrom,
  canUndo,
  onCommit,
  onRegister,
  onUndo,
}: Props) => {
  const isTop = depth === 0;

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const up = useMotionValue(0);
  const opacity = useMotionValue(1);
  const scrollProgress = useMotionValue(0);
  const rotate = useTransform(x, (value) =>
    reducedMotion ? 0 : photoRotation(value),
  );
  // Следующая карточка лежит под верхней (0.95) и поднимается по её сдвигу.
  const underScale = useTransform(progress, (p) => 0.95 + 0.05 * p);

  const ref = useRef<HTMLDivElement>(null);
  const descriptionId = useId();
  const dragRef = useRef<Drag | null>(null);
  const animations = useRef<AnimationPlaybackControls[]>([]);
  const suppressClick = useRef(false);
  const committed = useRef(false);
  // Флаг занятости колоды выставила эта карточка — снять его при
  // размонтировании: остановленная анимация не завершает свой Promise, и
  // иначе колода перестала бы отвечать на жесты, кнопки и клавиши.
  const ownsBusy = useRef(false);
  const setBusy = (busy: boolean) => {
    ownsBusy.current = busy;
    isBusyRef.current = busy;
  };

  const stopAnimations = () => {
    animations.current.forEach((animation) => animation.stop());
    animations.current = [];
  };

  useMotionValueEvent(x, "change", (value) => {
    if (isTop) progress.set(photoProgress(value));
  });

  const commit = (direction: SwipeDirection) => {
    if (committed.current) return;
    committed.current = true;
    setBusy(false);
    onCommit(direction);
  };

  const fly = (direction: SwipeDirection) => {
    stopAnimations();
    setBusy(true);
    vibrate(15);
    if (direction === "up") up.set(1);

    // prefers-reduced-motion: короткий fade и сдвиг 40px за 160ms.
    if (reducedMotion) {
      const shift = direction === "right" ? 40 : direction === "left" ? -40 : 0;
      animations.current = [
        animate(opacity, 0, { duration: 0.16 }),
        animate(x, shift, { duration: 0.16 }),
        animate(y, direction === "up" ? -40 : 0, { duration: 0.16 }),
      ];
    } else {
      const transition = {
        duration: PHOTO_FLY_DURATION,
        ease: "easeIn",
      } as const;
      animations.current =
        direction === "up"
          ? [animate(y, PHOTO_FLY_Y, transition)]
          : [
              animate(
                x,
                direction === "right" ? PHOTO_FLY_X : -PHOTO_FLY_X,
                transition,
              ),
            ];
    }
    Promise.all(animations.current).then(() => commit(direction));
  };

  const springBack = () => {
    stopAnimations();
    if (reducedMotion) {
      x.set(0);
      return;
    }
    animations.current = [animate(x, 0, SPRING_PHOTO_BACK)];
  };

  const swipe = (direction: SwipeDirection) => {
    if (!isTop || disabled || isBusyRef.current) return;
    fly(direction);
  };

  const scrollToDetails = () => {
    const element = ref.current;
    if (!element) return;
    element.scrollTo({
      top: element.clientHeight,
      behavior: reducedMotion ? "auto" : "smooth",
    });
  };

  useEffect(() => {
    if (!isTop) return;
    onRegister({ swipe, scrollToDetails, element: () => ref.current });
    return () => onRegister(null);
  });

  // Новая верхняя и вернувшаяся карточка показываются с начала: нижняя могла
  // остаться прокрученной, если её накрыли «Вернуть» (DESIGN.md §6).
  useLayoutEffect(() => {
    const element = ref.current;
    if (element) element.scrollTop = 0;
    scrollProgress.set(0);
    if (!isTop) return;
    progress.set(0);
    if (!enterFrom || reducedMotion) return;
    if (enterFrom === "up") y.set(PHOTO_FLY_Y);
    else x.set(enterFrom === "right" ? PHOTO_FLY_X : -PHOTO_FLY_X);
    setBusy(true);
    animations.current = [
      animate(x, 0, SPRING_PHOTO_ENTER),
      animate(y, 0, SPRING_PHOTO_ENTER),
    ];
    Promise.all(animations.current).then(() => setBusy(false));
    // Только при появлении верхней — повторный запуск сбил бы анимацию.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop]);

  useEffect(
    () => () => {
      stopAnimations();
      if (ownsBusy.current) isBusyRef.current = false;
    },
    // Только при размонтировании.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isTop || disabled || isBusyRef.current || event.button > 0) return;
    // Клик после перетаскивания на таче часто не приходит — флаг не должен
    // съесть следующий настоящий тап.
    suppressClick.current = false;
    stopAnimations();
    dragRef.current = {
      id: event.pointerId,
      axis: null,
      crossed: false,
      startX: event.clientX - x.get(),
      startY: event.clientY,
      samples: [{ x: event.clientX, y: event.clientY, t: performance.now() }],
    };
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    if (drag.axis === null) {
      drag.axis = lockAxis(dx - x.get(), event.clientY - drag.startY);
      if (drag.axis === null) return;
      if (drag.axis === "y") {
        // Прокрутка: карточку не тянем; если её поймали на возврате —
        // довозвращаем.
        dragRef.current = null;
        if (x.get() !== 0) springBack();
        return;
      }
      // Захват — только с началом перетаскивания: тап по фото и по названию
      // остаётся обычным кликом по своему элементу.
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Указатель уже отпущен (быстрый жест) — дотянем без захвата.
      }
      ref.current?.setAttribute("data-dragging", "");
    }
    x.set(dx);
    const crossed = Math.abs(dx) > PHOTO_DISTANCE;
    if (crossed && !drag.crossed) vibrate(8);
    drag.crossed = crossed;
    drag.samples.push({
      x: event.clientX,
      y: event.clientY,
      t: performance.now(),
    });
    if (drag.samples.length > 8) drag.samples.shift();
  };

  const handlePointerEnd = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    dragRef.current = null;
    ref.current?.removeAttribute("data-dragging");
    if (drag.axis !== "x") {
      // Тап по карточке на возврате остановил пружину — довозвращаем.
      if (x.get() !== 0) springBack();
      return;
    }
    suppressClick.current = true;
    const direction = decidePhotoDirection(x.get(), velocityOf(drag.samples).x);
    if (direction) fly(direction);
    else springBack();
  };

  // Клик, который пришёл в конце перетаскивания, — не тап.
  const handleClickCapture = (event: MouseEvent) => {
    if (!suppressClick.current) return;
    suppressClick.current = false;
    event.stopPropagation();
    event.preventDefault();
  };

  return (
    <motion.div
      ref={ref}
      inert={!isTop}
      aria-hidden={isTop ? undefined : true}
      role={isTop ? "group" : undefined}
      aria-roledescription={isTop ? "карточка" : undefined}
      aria-label={isTop ? label : undefined}
      aria-describedby={isTop && description ? descriptionId : undefined}
      className={
        isTop
          ? "bg-velvet absolute inset-0 overflow-x-hidden overflow-y-auto overscroll-contain rounded-[24px] shadow-[0_18px_40px_-12px_rgb(10_0_8/0.55),0_4px_10px_rgb(10_0_8/0.25)] [scrollbar-width:none] will-change-transform data-[dragging]:overflow-y-hidden [&::-webkit-scrollbar]:hidden"
          : "bg-velvet pointer-events-none absolute inset-0 overflow-hidden rounded-[24px] shadow-[0_18px_40px_-12px_rgb(10_0_8/0.55),0_4px_10px_rgb(10_0_8/0.25)]"
      }
      style={{
        zIndex: 10 - depth,
        // Вертикаль — браузеру (прокрутка), горизонталь — жесту.
        touchAction: isTop ? "pan-y" : undefined,
        ...(isTop ? { x, y, rotate, opacity } : { scale: underScale }),
      }}
      onScroll={(event) =>
        scrollProgress.set(scrollProgressFor(event.currentTarget.scrollTop))
      }
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={handleClickCapture}
    >
      {isTop && description && (
        <span id={descriptionId} hidden>
          {description}
        </span>
      )}
      <PhotoCardContext
        value={{
          isTop,
          x,
          up,
          scrollProgress,
          scrollToDetails,
          swipe,
          undo: onUndo,
          canUndo,
          disabled,
        }}
      >
        {children}
      </PhotoCardContext>
    </motion.div>
  );
};

// Отклик на жест поверх фото (DESIGN.md §6): цветная вуаль по сдвигу и круг с
// иконкой по центру. Кладётся карточкой внутрь фото, под текстовый блок.
export const PhotoSwipeFeedback = ({
  x,
  up,
  icons,
}: {
  icons: Record<SwipeDirection, ReactNode>;
  up: MotionValue<number>;
  x: MotionValue<number>;
}) => {
  const tint = useTransform([x, up], ([dx, flyingUp]: number[]) =>
    flyingUp
      ? "rgb(255 210 122 / 0.35)"
      : (dx ?? 0) >= 0
        ? `rgb(255 138 61 / ${Math.min((dx ?? 0) / 160, 1) * 0.35})`
        : `rgb(42 16 36 / ${Math.min(-(dx ?? 0) / 160, 1) * 0.45})`,
  );
  const fade = (from: number, to: number) => (value: number) =>
    Math.min(Math.max((value - from) / (to - from), 0), 1);
  const right = useTransform(x, fade(20, 120));
  const left = useTransform(x, (value) => fade(20, 120)(-value));
  const circle =
    "bg-paper pointer-events-none absolute top-[42%] left-1/2 -mt-8 -ml-8 grid size-16 place-items-center rounded-full shadow-[0_10px_24px_rgb(10_0_8/0.3)]";
  return (
    <>
      <motion.div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{ backgroundColor: tint }}
      />
      <motion.div aria-hidden className={circle} style={{ opacity: right }}>
        {icons.right}
      </motion.div>
      <motion.div aria-hidden className={circle} style={{ opacity: left }}>
        {icons.left}
      </motion.div>
      <motion.div aria-hidden className={circle} style={{ opacity: up }}>
        {icons.up}
      </motion.div>
    </>
  );
};
