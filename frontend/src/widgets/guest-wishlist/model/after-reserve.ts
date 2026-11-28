// Под какой карточкой плашка «Подарок выбран. А что хочешь ты?» (auto-tasks
// P01, UX-аудит G03): под первой забронированной на этой странице, пока бронь
// ещё твоя. Сняли её — плашка уходит, а если есть другая бронь с этой
// страницы — переезжает под неё. Забронировали снова — появляется снова.
// reservedKeys — желания, забронированные на этой странице, по порядку.
export const afterReserveKey = (
  reservedKeys: readonly string[],
  isMine: (itemKey: string) => boolean,
): null | string => reservedKeys.find(isMine) ?? null;

// Новая бронь — в конец списка; повторная бронь того же желания место не
// меняет.
export const addReservedKey = (
  reservedKeys: readonly string[],
  itemKey: string,
): string[] =>
  reservedKeys.includes(itemKey)
    ? [...reservedKeys]
    : [...reservedKeys, itemKey];
