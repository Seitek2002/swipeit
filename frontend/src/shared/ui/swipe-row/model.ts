// Решение «открыть или закрыть» строку со свайп-действиями после жеста —
// чистая функция, чтобы её можно было проверить без браузера.

// Какую долю ширины блока действий нужно протянуть, чтобы строка
// переключилась: иначе пришлось бы тянуть её до конца самому.
export const SWIPE_ROW_TOGGLE_RATIO = 0.4;
// Быстрый смахивающий жест решает сам, даже если протянули немного (px/s).
export const SWIPE_ROW_FLICK_VELOCITY = 500;

type Gesture = {
  // Где строка сейчас по X (0 — закрыта, −width — открыта полностью).
  position: number;
  // Скорость жеста по X в момент отпускания, px/s (влево — меньше нуля).
  velocity: number;
  // Была ли строка открыта до жеста.
  wasOpen: boolean;
  // Ширина блока действий.
  width: number;
};

export const shouldOpenSwipeRow = ({
  position,
  velocity,
  wasOpen,
  width,
}: Gesture): boolean => {
  if (width <= 0) return false;
  if (velocity < -SWIPE_ROW_FLICK_VELOCITY) return true;
  if (velocity > SWIPE_ROW_FLICK_VELOCITY) return false;
  // Порог отсчитывается от того положения, где строка стояла: и открыть, и
  // закрыть — протянуть 40% ширины действий.
  const threshold = wasOpen
    ? -width * (1 - SWIPE_ROW_TOGGLE_RATIO)
    : -width * SWIPE_ROW_TOGGLE_RATIO;
  return position < threshold;
};
