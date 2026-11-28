import { minPicksFor, upToGifts } from "@/shared/api";
import { plural } from "@/shared/lib/format";

// Счётчик выбора друга по ссылке-фильтру и лимит «Сколько можно выбрать».
//
// Сервер знает «Хочу» после ответа на свайп, а лимит должен держать сразу:
// третий «Хочу» при лимите 3 — и колода уже стоит, четвёртый не поставить,
// даже если ответ ещё в пути. Поэтому к выбору с сервера добавляем свои
// свежие «Хочу» и отмены: true — выбран, false — отменён («Вернуть»).
export type PickOverrides = ReadonlyMap<string, boolean>;

export const countPicks = (
  serverIds: readonly string[],
  overrides: PickOverrides,
) => {
  const picked = new Set(serverIds);
  overrides.forEach((liked, id) => {
    if (liked) picked.add(id);
    else picked.delete(id);
  });
  return picked.size;
};

export type PickProgress = {
  // Можно отправить выбор.
  canSend: boolean;
  count: number;
  // Лимит выбран полностью — колода стоит.
  full: boolean;
  // Сколько ещё до отправки.
  left: number;
  maxPicks?: number;
};

export const pickProgress = (
  count: number,
  maxPicks?: number,
): PickProgress => {
  const min = minPicksFor(maxPicks);
  return {
    count,
    maxPicks,
    left: Math.max(0, min - count),
    canSend: count >= min,
    full: maxPicks !== undefined && count >= maxPicks,
  };
};

const gifts = (count: number) =>
  `${count} ${plural(count, ["подарок", "подарка", "подарков"])}`;

// Шаг «Выбери…» на приглашении: без лимита — «хотя бы три», с лимитом —
// сколько можно.
export const pickGoalText = (maxPicks?: number) => {
  const min = minPicksFor(maxPicks);
  if (maxPicks === undefined) return "Выбери хотя бы три подарка";
  if (min === maxPicks) {
    return maxPicks === 1 ? "Выбери один подарок" : `Выбери ${gifts(maxPicks)}`;
  }
  return `Выбери от ${min} ${upToGifts(maxPicks)}`;
};

// Строка под колодой, пока отправлять рано.
export const progressText = ({ count, left, maxPicks }: PickProgress) => {
  if (count === 0) return pickGoalText(maxPicks);
  const of = maxPicks === undefined ? "" : `Выбрано ${count} из ${maxPicks}. `;
  return `${of}Ещё ${gifts(left)} — и можно отправить`;
};
