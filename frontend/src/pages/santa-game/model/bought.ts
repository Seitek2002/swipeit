import type { SantaWardItem } from "@/entities/santa-game";

// Выбор в «Что купил?»: ключ желания или null — «Другое — не из вишлиста».
export type BoughtChoice = { itemKey: null | string; title: null | string };

// Отметка, которую шлём на сервер (POST /santa/:id/bought).
export type BoughtState = { bought: boolean; itemKey: null | string };

// Что отмечено сейчас (Y05): ключ своей брони на вишлисте подопечного, null
// — «Другое» (отметка без брони), undefined — ещё не отмечено.
export const currentBought = (
  me: {
    bought: boolean;
    ward: {
      wishlist: readonly Pick<SantaWardItem, "key" | "reservedByMe">[];
    } | null;
  } | null,
): null | string | undefined => {
  if (!me?.bought) return undefined;
  return me.ward?.wishlist.find((item) => item.reservedByMe)?.key ?? null;
};

export const boughtStateOf = (
  current: null | string | undefined,
): BoughtState =>
  current === undefined
    ? { bought: false, itemKey: null }
    : { bought: true, itemKey: current };

// Тост после выбора (Y05): что именно отметили — промах по строке видно
// сразу, «Отменить» вернёт прежнее.
export const boughtToast = (next: BoughtState, title: null | string) => {
  if (!next.bought) return "Отметка снята";
  return title ? `Отмечено: ${title}` : "Отмечено: подарок куплен";
};
