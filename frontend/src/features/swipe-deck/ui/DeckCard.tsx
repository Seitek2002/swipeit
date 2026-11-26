"use client";

import {
  type MouseEvent,
  type PointerEvent,
  type ReactNode,
  type RefObject,
  useEffect,
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
  DRAG_SLOP,
  SPRING_CARD,
  SPRING_FLY,
  type Sample,
  type SwipeDirection,
  decideDirection,
  flyTarget,
  progressFor,
  rotationFor,
  stampOpacities,
  velocityOf,
} from "../model";

export type CardApi = { swipe: (direction: SwipeDirection) => void };

export type ButtonRefs = Partial<
  Record<SwipeDirection, HTMLButtonElement | null>
>;

type Props = {
  buttonsRef: RefObject<ButtonRefs>;
  cardHeight: number;
  cardWidth: number;
  children: ReactNode;
  containerWidth: number;
  depth: number;
  directions: readonly SwipeDirection[];
  disabled: boolean;
  // Карточку вернули «Отменой» — прилетает с той стороны, куда ушла.
  enterFrom?: SwipeDirection;
  isBusyRef: RefObject<boolean>;
  label: string;
  labels: Record<SwipeDirection, string>;
  onCommit: (direction: SwipeDirection) => void;
  // Верхняя карточка отдаёт колоде своё «улетание» для кнопок и клавиатуры.
  onRegister: (api: CardApi | null) => void;
  progress: MotionValue<number>;
  reducedMotion: boolean;
  stampTop: number;
  topInset: number;
};

type Drag = {
  crossed: boolean;
  grabTop: boolean;
  id: number;
  moved: boolean;
  samples: Sample[];
  startX: number;
  startY: number;
};

const stampBase =
  "pointer-events-none absolute z-[5] rounded-[10px] px-3 pt-1.5 pb-[5px] text-[24px] leading-none font-bold tracking-[0.06em] text-ink opacity-0 shadow-[inset_0_0_0_2px_rgb(42_16_36/0.85),0_6px_16px_-6px_rgb(10_0_8/0.4)]";

// Одна карточка колоды. Верхняя следует за пальцем; нижние лежат под ней
// (scale 0.95, y +12px) и поднимаются по прогрессу верхней. Позиция — только
// motion values: во время перетаскивания React не перерисовывает ничего
// (DESIGN.md §6, TECH_SPEC §9).
export const DeckCard = ({
  children,
  depth,
  label,
  cardWidth,
  cardHeight,
  containerWidth,
  topInset,
  stampTop,
  directions,
  labels,
  progress,
  buttonsRef,
  isBusyRef,
  disabled,
  reducedMotion,
  enterFrom,
  onCommit,
  onRegister,
}: Props) => {
  const isTop = depth === 0;
  const allowUp = directions.includes("up");

  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const rotate = useMotionValue(0);
  const opacity = useMotionValue(1);
  // Точка вращения: внизу, если взяли за верхнюю половину, иначе вверху.
  const originY = useMotionValue(1);

  // Нижние карточки: поднимаются на место по мере сдвига верхней.
  const depthScale = useTransform(progress, (p) =>
    depth === 1 ? 0.95 + 0.05 * p : 0.9 + 0.05 * p,
  );
  const depthY = useTransform(progress, (p) =>
    depth === 1 ? 12 - 12 * p : 24 - 12 * p,
  );
  const depthOpacity = useTransform(progress, (p) => (depth === 1 ? 1 : p));

  const wrapperRef = useRef<HTMLDivElement>(null);
  const stampRefs = useRef<Record<SwipeDirection, HTMLSpanElement | null>>({
    left: null,
    right: null,
    up: null,
  });
  const dragRef = useRef<Drag | null>(null);
  const animations = useRef<AnimationPlaybackControls[]>([]);
  const suppressClick = useRef(false);
  const flying = useRef<null | SwipeDirection>(null);

  const stopAnimations = () => {
    animations.current.forEach((animation) => animation.stop());
    animations.current = [];
  };

  // Применить сдвиг к штампам, прогрессу и кнопкам — без React.
  const finish = (direction: SwipeDirection) => {
    if (!flying.current) return;
    flying.current = null;
    stopAnimations();
    (["left", "right", "up"] as const).forEach((key) =>
      buttonsRef.current[key]?.style.setProperty("--p", "0"),
    );
    isBusyRef.current = false;
    onCommit(direction);
  };

  const applyFrame = () => {
    if (!isTop) return;
    const currentX = x.get();
    const currentY = y.get();
    if (!reducedMotion) {
      rotate.set(rotationFor(currentX, originY.get() === 1));
    }
    const stamps = stampOpacities(currentX, currentY, allowUp);
    (Object.keys(stamps) as SwipeDirection[]).forEach((direction) => {
      const element = stampRefs.current[direction];
      if (element) element.style.opacity = String(stamps[direction]);
      buttonsRef.current[direction]?.style.setProperty(
        "--p",
        String(stamps[direction]),
      );
    });
    progress.set(progressFor(currentX, currentY, cardWidth, allowUp));

    // Улетающая карточка засчитывается, как только почти скрылась.
    if (flying.current) {
      const target = flyTarget(
        flying.current,
        containerWidth,
        cardWidth,
        cardHeight,
      );
      const done =
        flying.current === "up"
          ? currentY < target.y * 0.92
          : Math.abs(currentX) > Math.abs(target.x) * 0.92;
      if (done) finish(flying.current);
    }
  };

  useMotionValueEvent(x, "change", applyFrame);
  useMotionValueEvent(y, "change", applyFrame);

  const fly = (
    direction: SwipeDirection,
    velocity: { x: number; y: number },
  ) => {
    stopAnimations();
    isBusyRef.current = true;
    flying.current = direction;
    vibrate(15);
    const stamp = stampRefs.current[direction];
    if (stamp) stamp.style.opacity = "1";

    // prefers-reduced-motion: короткий fade и сдвиг 40px за 160ms.
    if (reducedMotion) {
      const shift = direction === "right" ? 40 : direction === "left" ? -40 : 0;
      animations.current = [
        animate(opacity, 0, { duration: 0.16 }),
        animate(x, shift, { duration: 0.16 }),
        animate(y, direction === "up" ? -40 : 0, { duration: 0.16 }),
      ];
      setTimeout(() => finish(direction), 170);
      return;
    }

    const target = flyTarget(direction, containerWidth, cardWidth, cardHeight);
    const currentY = y.get();
    const currentX = x.get();
    const toY = direction === "up" ? target.y : currentY + velocity.y * 0.12;
    const toX = direction === "up" ? currentX + velocity.x * 0.12 : target.x;
    // Скорость жеста передаётся пружине — карточка уходит «с рук».
    const vx =
      direction === "right"
        ? Math.max(velocity.x, 900)
        : direction === "left"
          ? Math.min(velocity.x, -900)
          : velocity.x;
    const vy = direction === "up" ? Math.min(velocity.y, -900) : velocity.y;
    animations.current = [
      animate(x, toX, { ...SPRING_FLY, velocity: vx }),
      animate(y, toY, { ...SPRING_FLY, velocity: vy }),
    ];
    // Подстраховка: если пружина остановилась раньше порога — засчитать.
    Promise.all(animations.current).then(() => finish(direction));
  };

  const springBack = (velocity = { x: 0, y: 0 }) => {
    stopAnimations();
    if (reducedMotion) {
      x.set(0);
      y.set(0);
      return;
    }
    animations.current = [
      animate(x, 0, { ...SPRING_CARD, velocity: velocity.x }),
      animate(y, 0, { ...SPRING_CARD, velocity: velocity.y }),
    ];
  };

  // Кнопки и клавиатура: короткий «замах» 170ms, потом то же улетание, что и
  // у жеста (DESIGN.md §6: не мгновенное исчезновение).
  const swipeByButton = (direction: SwipeDirection) => {
    if (isBusyRef.current || disabled || !directions.includes(direction))
      return;
    if (reducedMotion) {
      fly(direction, { x: 0, y: 0 });
      return;
    }
    isBusyRef.current = true;
    originY.set(1);
    const tx =
      direction === "right"
        ? cardWidth * 0.32
        : direction === "left"
          ? -cardWidth * 0.32
          : 0;
    const ty = direction === "up" ? -cardHeight * 0.2 : -6;
    animations.current = [
      animate(x, tx, { duration: 0.17, ease: "easeOut" }),
      animate(y, ty, { duration: 0.17, ease: "easeOut" }),
    ];
    Promise.all(animations.current).then(() =>
      fly(direction, {
        x: direction === "right" ? 1400 : direction === "left" ? -1400 : 0,
        y: direction === "up" ? -1400 : 0,
      }),
    );
  };

  useEffect(() => {
    if (!isTop) return;
    onRegister({ swipe: swipeByButton });
    return () => onRegister(null);
  });

  // Верхней стала карточка, возвращённая «Отменой»: ставим её за край и
  // пружиной возвращаем на место. До отрисовки — чтобы не мигнула в центре.
  useLayoutEffect(() => {
    if (!isTop) return;
    progress.set(0);
    if (!enterFrom || reducedMotion) return;
    const target = flyTarget(enterFrom, containerWidth, cardWidth, cardHeight);
    x.set(enterFrom === "up" ? 0 : target.x);
    y.set(enterFrom === "up" ? target.y : -20);
    isBusyRef.current = true;
    animations.current = [
      animate(x, 0, SPRING_CARD),
      animate(y, 0, SPRING_CARD),
    ];
    Promise.all(animations.current).then(() => {
      isBusyRef.current = false;
    });
    // Только при появлении верхней — повторный запуск сбил бы анимацию.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTop]);

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (!isTop || disabled || isBusyRef.current || event.button > 0) return;
    stopAnimations();
    dragRef.current = {
      id: event.pointerId,
      startX: event.clientX - x.get(),
      startY: event.clientY - y.get(),
      grabTop: true,
      moved: false,
      crossed: false,
      samples: [{ x: event.clientX, y: event.clientY, t: performance.now() }],
    };
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current.grabTop = event.clientY - rect.top < rect.height / 2;
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved) {
      if (Math.hypot(dx - x.get(), dy - y.get()) < DRAG_SLOP) return;
      // Захват — только с началом перетаскивания: тап по фото и «(i)»
      // остаётся обычным кликом по своему элементу.
      drag.moved = true;
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        // Указатель уже отпущен (быстрый жест) — дотянем без захвата.
      }
      originY.set(drag.grabTop ? 1 : 0);
      wrapperRef.current?.setAttribute("data-dragging", "");
    }
    x.set(dx);
    y.set(dy);
    const reached = progress.get() >= 1;
    if (reached && !drag.crossed) vibrate(8);
    drag.crossed = reached;
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
    wrapperRef.current?.removeAttribute("data-dragging");
    if (!drag.moved) return;
    suppressClick.current = true;
    const velocity = velocityOf(drag.samples);
    const direction = decideDirection({
      x: x.get(),
      y: y.get(),
      velocity,
      cardWidth,
      cardHeight,
      directions,
    });
    if (direction) fly(direction, velocity);
    else springBack(velocity);
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
      ref={wrapperRef}
      aria-hidden={isTop ? undefined : true}
      role={isTop ? "group" : undefined}
      aria-roledescription={isTop ? "карточка" : undefined}
      aria-label={isTop ? label : undefined}
      className="absolute left-1/2 drop-shadow-[0_18px_20px_rgb(10_0_8/0.42)] will-change-transform data-[dragging]:cursor-grabbing data-[dragging]:drop-shadow-[0_30px_34px_rgb(10_0_8/0.55)]"
      style={{
        top: topInset,
        width: cardWidth,
        height: cardHeight,
        marginLeft: -cardWidth / 2,
        zIndex: 10 - depth,
        touchAction: isTop ? "none" : undefined,
        cursor: isTop ? "grab" : undefined,
        pointerEvents: isTop ? undefined : "none",
        ...(isTop
          ? { x, y, rotate, opacity, originY }
          : { scale: depthScale, y: depthY, opacity: depthOpacity }),
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerEnd}
      onPointerCancel={handlePointerEnd}
      onClickCapture={handleClickCapture}
    >
      {children}
      {isTop && (
        <>
          <span
            ref={(element) => {
              stampRefs.current.right = element;
            }}
            aria-hidden
            className={`${stampBase} bg-mint left-[22px] -rotate-12`}
            style={{ top: stampTop }}
          >
            {labels.right}
          </span>
          <span
            ref={(element) => {
              stampRefs.current.left = element;
            }}
            aria-hidden
            className={`${stampBase} bg-rose right-[22px] rotate-12`}
            style={{ top: stampTop }}
          >
            {labels.left}
          </span>
          {allowUp && (
            <span
              ref={(element) => {
                stampRefs.current.up = element;
              }}
              aria-hidden
              className={`${stampBase} bg-champagne bottom-[46%] left-1/2 -translate-x-1/2 -rotate-[4deg] whitespace-nowrap`}
            >
              {labels.up}
            </span>
          )}
        </>
      )}
    </motion.div>
  );
};
