"use client";

import {
  type ReactNode,
  type Ref,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { useMotionValue, useReducedMotion } from "motion/react";

import { cn } from "@/shared/lib/utils";
import { type SwipeAction, SwipeActionButton } from "@/shared/ui";

import { type SwipeDirection, cardSize } from "../model";
import { type ButtonRefs, type CardApi, DeckCard } from "./DeckCard";
import { type PhotoCardApi, PhotoDeckCard } from "./PhotoDeckCard";

export type SwipeDeckHandle = {
  swipe: (direction: SwipeDirection) => void;
  undo: () => void;
};

type Props<T> = {
  // Озвучка результата свайпа для скринридера («Добавлено в вишлист»).
  announce?: (item: T, direction: SwipeDirection) => string;
  canUndo?: boolean;
  className?: string;
  directions?: readonly SwipeDirection[];
  // Нет связи с LAN-сервером — колода и кнопки неактивны (DESIGN.md §8.11).
  disabled?: boolean;
  // Что показать, когда карточки кончились.
  empty?: ReactNode;
  getKey: (item: T) => string;
  getLabel: (item: T) => string;
  handleRef?: Ref<SwipeDeckHandle>;
  // Очередь: items[0] — верхняя. Родитель убирает карточку в onDecision и
  // возвращает её первой в onUndo.
  items: T[];
  labels?: Partial<Record<SwipeDirection, string>>;
  onDecision: (item: T, direction: SwipeDirection) => void;
  // Осталось 3 карточки — пора дозапросить следующую порцию.
  onNeedMore?: () => void;
  onOpen?: (item: T) => void;
  // Вернуть последнюю карточку. Родитель кладёт её первой и сообщает, куда
  // она уходила, — колода прилетит с той стороны (null — возвращать нечего).
  onUndo?: () => { direction: SwipeDirection; key: string } | null;
  renderCard?: (item: T, state: { isTop: boolean }) => ReactNode;
  // Колода подарков (DESIGN.md §6 «Колода подарков»): фото-карточка с
  // прокруткой к подробностям, жест только по X, кнопки внутри карточки.
  // Если задан — вместо renderCard, штампов и ряда кнопок под колодой.
  // Состояние карточки (отклик, прокрутка, кнопки) — через usePhotoCard().
  renderPhotoCard?: (item: T) => ReactNode;
  // Отступ сверху — место под нитку бирки.
  stampTop?: number;
  topInset?: number;
};

const ACTIONS: Record<SwipeDirection, SwipeAction> = {
  left: "pass",
  up: "super",
  right: "like",
};

const DEFAULT_LABELS: Record<SwipeDirection, string> = {
  right: "ХОЧУ",
  left: "МИМО",
  up: "ОЧЕНЬ ХОЧУ",
};

const VISIBLE = 3;
// У фото-колоды в DOM две карточки: верхняя и следующая под ней.
const VISIBLE_PHOTO = 2;

// Клавиши прокрутки фото-карточки (↑ занята «Очень хочу»).
const SCROLL_KEYS = ["ArrowDown", "PageDown", "PageUp", " ", "Home", "End"];

const isTypingTarget = (target: EventTarget | null) =>
  target instanceof HTMLElement &&
  (target.matches("input, textarea, select, [contenteditable]") ||
    target.closest('[role="slider"]') !== null);

// Движок колоды (TASKS T06): общий для бирок подарков и билетиков занятий.
// Ничего не знает о товарах и занятиях — получает элементы, рендер карточки,
// разрешённые направления и колбэк решения (TECH_SPEC §4).
export const SwipeDeck = <T,>({
  items,
  getKey,
  getLabel,
  renderCard,
  renderPhotoCard,
  directions = ["left", "right", "up"],
  onDecision,
  onUndo,
  canUndo = false,
  onNeedMore,
  onOpen,
  empty,
  topInset = 34,
  stampTop = 58,
  labels,
  announce,
  disabled = false,
  handleRef,
  className,
}: Props<T>) => {
  const reducedMotion = Boolean(useReducedMotion());
  const progress = useMotionValue(0);
  const areaRef = useRef<HTMLDivElement>(null);
  const buttonsRef = useRef<ButtonRefs>({});
  const topApi = useRef<CardApi | null>(null);
  const photoApi = useRef<null | PhotoCardApi>(null);
  const isPhoto = renderPhotoCard !== undefined;
  const isBusyRef = useRef(false);
  const [enterFrom, setEnterFrom] = useState<{
    direction: SwipeDirection;
    key: string;
  } | null>(null);
  const [area, setArea] = useState({ width: 0, height: 0 });
  const [announcement, setAnnouncement] = useState("");

  const visible = items.slice(0, isPhoto ? VISIBLE_PHOTO : VISIBLE);
  const top = visible[0];
  const { cardWidth, cardHeight } = cardSize(area.width, area.height, topInset);
  const allLabels = { ...DEFAULT_LABELS, ...labels };

  // Размер карточки — от места между шапкой и кнопками (DESIGN.md §7).
  useLayoutEffect(() => {
    const element = areaRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setArea((current) =>
        current.width === width && current.height === height
          ? current
          : { width, height },
      );
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (items.length <= 3) onNeedMore?.();
    // Только при изменении длины очереди, а не на каждый рендер родителя.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items.length]);

  const swipe = (direction: SwipeDirection) => {
    if (disabled || !top) return;
    (isPhoto ? photoApi.current : topApi.current)?.swipe(direction);
  };

  const undo = () => {
    if (disabled || !canUndo || isBusyRef.current || !onUndo) return;
    const restored = onUndo();
    if (restored) setEnterFrom(restored);
  };

  useImperativeHandle(handleRef, () => ({ swipe, undo }));

  const handleCommit = (direction: SwipeDirection) => {
    if (!top) return;
    setEnterFrom(null);
    if (announce) setAnnouncement(announce(top, direction));
    onDecision(top, direction);
  };

  // Клавиатура (DESIGN.md §10): ← «Мимо», → «Хочу», ↑ «Очень хочу»,
  // Backspace/Z «Вернуть», Enter/Space «Подробнее». Пока открыта шторка или
  // диалог, колода клавиш не слушает.
  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.defaultPrevented
      )
        return;
      if (isTypingTarget(event.target)) return;
      if (document.querySelector('[role="dialog"], [role="alertdialog"]'))
        return;
      const key = event.key;
      const onControl =
        event.target instanceof HTMLElement &&
        event.target.closest("button, a") !== null;
      if (isPhoto && top && SCROLL_KEYS.includes(key) && !onControl) {
        // Фокус внутри карточки — браузер прокрутит её сам; иначе крутим
        // верхнюю карточку за него (DESIGN.md §10).
        const card = photoApi.current?.element();
        if (!card || card.contains(event.target as Node)) return;
        event.preventDefault();
        const page = card.clientHeight * 0.85;
        if (key === "Home") card.scrollTo({ top: 0 });
        else if (key === "End") card.scrollTo({ top: card.scrollHeight });
        else
          card.scrollBy({
            top: key === "PageUp" ? -page : key === "ArrowDown" ? 60 : page,
          });
        return;
      }
      const map: Record<string, SwipeDirection> = {
        ArrowLeft: "left",
        ArrowRight: "right",
        ArrowUp: "up",
      };
      const direction = map[key];
      if (direction && directions.includes(direction)) {
        event.preventDefault();
        swipe(direction);
      } else if (["Backspace", "z", "Z", "я", "Я"].includes(key)) {
        event.preventDefault();
        undo();
      } else if (isPhoto && key === "Enter" && top && !onControl) {
        // Enter прокручивает фото-карточку к подробностям.
        event.preventDefault();
        photoApi.current?.scrollToDetails();
      } else if (
        (key === "Enter" || key === " ") &&
        top &&
        onOpen &&
        !onControl
      ) {
        event.preventDefault();
        onOpen(top);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  const buttonOrder: SwipeDirection[] = (
    ["left", "up", "right"] as const
  ).filter((direction) => directions.includes(direction));

  return (
    <div className={cn("flex min-h-0 flex-1 flex-col", className)}>
      <div
        ref={areaRef}
        className={cn(
          "relative min-h-0 flex-1",
          isPhoto ? "mx-4 mt-3" : "mx-5",
          disabled && "opacity-50",
        )}
      >
        {isPhoto &&
          renderPhotoCard &&
          [...visible].reverse().map((item) => {
            const key = getKey(item);
            const depth = visible.indexOf(item);
            return (
              <PhotoDeckCard
                key={key}
                depth={depth}
                label={getLabel(item)}
                progress={progress}
                isBusyRef={isBusyRef}
                disabled={disabled}
                reducedMotion={reducedMotion}
                canUndo={canUndo && !disabled}
                onUndo={undo}
                enterFrom={
                  enterFrom?.key === key ? enterFrom.direction : undefined
                }
                onCommit={handleCommit}
                onRegister={(api) => {
                  if (depth === 0) photoApi.current = api;
                }}
              >
                {renderPhotoCard(item)}
              </PhotoDeckCard>
            );
          })}
        {!isPhoto &&
          renderCard &&
          area.width > 0 &&
          [...visible].reverse().map((item) => {
            const key = getKey(item);
            const depth = visible.indexOf(item);
            return (
              <DeckCard
                key={key}
                depth={depth}
                label={getLabel(item)}
                cardWidth={cardWidth}
                cardHeight={cardHeight}
                containerWidth={area.width}
                topInset={topInset}
                stampTop={stampTop}
                directions={directions}
                labels={allLabels}
                progress={progress}
                buttonsRef={buttonsRef}
                isBusyRef={isBusyRef}
                disabled={disabled}
                reducedMotion={reducedMotion}
                enterFrom={
                  enterFrom?.key === key ? enterFrom.direction : undefined
                }
                onCommit={handleCommit}
                onRegister={(api) => {
                  if (depth === 0) topApi.current = api;
                }}
              >
                {renderCard(item, { isTop: depth === 0 })}
              </DeckCard>
            );
          })}
        {!top && empty && (
          <div className="absolute inset-0 flex items-center justify-center">
            {empty}
          </div>
        )}
      </div>

      {!isPhoto && (
        <div
          className={cn(
            "flex h-[84px] flex-none items-center justify-center gap-[18px] pb-1",
            disabled && "opacity-50",
          )}
        >
          {onUndo && (
            <SwipeActionButton
              action="undo"
              disabled={disabled || !canUndo}
              onClick={undo}
            />
          )}
          {buttonOrder.map((direction) => (
            <SwipeActionButton
              key={direction}
              ref={(element) => {
                buttonsRef.current[direction] = element;
              }}
              action={ACTIONS[direction]}
              disabled={disabled || !top}
              onClick={() => swipe(direction)}
            />
          ))}
        </div>
      )}

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
};
