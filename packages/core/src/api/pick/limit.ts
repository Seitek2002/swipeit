// «Сколько можно выбрать» в ссылке-фильтре «Выбери подарок сам»: правило
// общее для мока, сервера и экрана друга.

// Больше 20 — уже не «выбери пару подарков», а вся лента.
export const PICK_LIMIT_MAX = 20;

// Столько «Хочу» нужно, чтобы отправить выбор (DESIGN.md §8.6: «после 3+»).
// С лимитом меньше трёх — сколько разрешено.
export const PICK_MIN_DEFAULT = 3;

export const minPicksFor = (maxPicks?: number) =>
  Math.min(PICK_MIN_DEFAULT, maxPicks ?? PICK_MIN_DEFAULT);

// Выбор помещается в лимит: нет лимита — помещается любой.
export const fitsPickLimit = (count: number, maxPicks?: number) =>
  maxPicks === undefined || count <= maxPicks;

// «до 1 подарка», «до 3 подарков», «до 21 подарка» — родительный после «до».
export const upToGifts = (count: number) =>
  `до ${count} ${count % 10 === 1 && count % 100 !== 11 ? "подарка" : "подарков"}`;
