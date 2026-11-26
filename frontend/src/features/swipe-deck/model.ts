// Чистая физика колоды (DESIGN.md §6 «Физика свайпа»). Без React — её
// проверяют тесты, а компонент только применяет числа к карточке.

export type SwipeDirection = "left" | "right" | "up";

// Карточка улетает, если сдвиг больше 35% ширины или скорость больше 600 px/s.
export const DISTANCE_SHARE = 0.35;
export const VELOCITY_THRESHOLD = 600;
// Вверх — свой порог по высоте: вертикальный ход у бирки короче.
export const UP_DISTANCE_SHARE = 0.25;
// Сдвиг, после которого нажатие считается перетаскиванием, а не тапом.
export const DRAG_SLOP = 6;
// Наклон: x / 20 градусов, не больше 15.
export const ROTATE_DIVIDER = 20;
export const MAX_ROTATE = 15;
// Штамп проявляется полностью на 100px сдвига.
export const STAMP_DISTANCE = 100;

export const SPRING_CARD = {
  type: "spring",
  stiffness: 320,
  damping: 30,
} as const;
export const SPRING_FLY = {
  type: "spring",
  stiffness: 200,
  damping: 26,
} as const;

const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

// Знак угла меняется вместе с точкой вращения: взял за нижнюю половину —
// бирка крутится вокруг верха и в обратную сторону (так ведёт себя бумага).
export const rotationFor = (x: number, grabTop: boolean) =>
  clamp(x / ROTATE_DIVIDER, -MAX_ROTATE, MAX_ROTATE) * (grabTop ? 1 : -1);

export type Stamps = { left: number; right: number; up: number };

// Прозрачность штампов по сдвигу. Вверх — только когда вертикаль сильнее
// горизонтали, иначе одновременно проявлялись бы два штампа.
export const stampOpacities = (
  x: number,
  y: number,
  allowUp: boolean,
): Stamps => {
  if (allowUp && -y > Math.abs(x)) {
    return { left: 0, right: 0, up: clamp(-y / STAMP_DISTANCE, 0, 1) };
  }
  return {
    left: clamp(-x / STAMP_DISTANCE, 0, 1),
    right: clamp(x / STAMP_DISTANCE, 0, 1),
    up: 0,
  };
};

// Прогресс жеста 0..1: на нём поднимается следующая карточка и
// подсвечиваются кнопки. 1 — порог улетания пройден.
export const progressFor = (
  x: number,
  y: number,
  cardWidth: number,
  allowUp: boolean,
) =>
  clamp(
    Math.max(Math.abs(x), allowUp ? -y : 0) / (cardWidth * DISTANCE_SHARE),
    0,
    1,
  );

export type Sample = { t: number; x: number; y: number };

// Скорость по последним 100 ms жеста (px/s): быстрый «флик» в конце важнее
// медленного начала.
export const velocityOf = (samples: Sample[]) => {
  const last = samples[samples.length - 1];
  if (!last) return { x: 0, y: 0 };
  let first = last;
  for (let i = samples.length - 1; i >= 0; i -= 1) {
    const sample = samples[i];
    if (!sample || last.t - sample.t > 100) break;
    first = sample;
  }
  const dt = Math.max(1, last.t - first.t);
  return {
    x: ((last.x - first.x) / dt) * 1000,
    y: ((last.y - first.y) / dt) * 1000,
  };
};

// Куда уходит карточка после отпускания — или null (пружиной назад).
export const decideDirection = ({
  x,
  y,
  velocity,
  cardWidth,
  cardHeight,
  directions,
}: {
  cardHeight: number;
  cardWidth: number;
  directions: readonly SwipeDirection[];
  velocity: { x: number; y: number };
  x: number;
  y: number;
}): null | SwipeDirection => {
  if (
    directions.includes("up") &&
    -y > Math.abs(x) &&
    (-y > cardHeight * UP_DISTANCE_SHARE || velocity.y < -VELOCITY_THRESHOLD)
  ) {
    return "up";
  }
  // «Флик» засчитываем при любом заметном сдвиге в ту же сторону.
  if (
    directions.includes("right") &&
    (x > cardWidth * DISTANCE_SHARE ||
      (velocity.x > VELOCITY_THRESHOLD && x > 10))
  ) {
    return "right";
  }
  if (
    directions.includes("left") &&
    (x < -cardWidth * DISTANCE_SHARE ||
      (velocity.x < -VELOCITY_THRESHOLD && x < -10))
  ) {
    return "left";
  }
  return null;
};

// Размер карточки в отведённом месте (reference.html, tagSize): вся высота
// под ниткой, ширина — не шире места и не шире 0.74 высоты.
export const cardSize = (width: number, height: number, topInset: number) => {
  const cardHeight = Math.max(260, height - topInset - 16);
  const cardWidth = Math.min(width, Math.round(cardHeight * 0.74));
  return { cardWidth, cardHeight };
};

// Куда улетает карточка — за край контейнера с запасом.
export const flyTarget = (
  direction: SwipeDirection,
  containerWidth: number,
  cardWidth: number,
  cardHeight: number,
) => {
  const outX = (containerWidth / 2 + cardWidth) * 1.15;
  const outY = cardHeight * 1.6;
  if (direction === "right") return { x: outX, y: 0 };
  if (direction === "left") return { x: -outX, y: 0 };
  return { x: 0, y: -outY };
};
