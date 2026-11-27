import { genitive } from "@/shared/lib/format";

export const NAME_MAX = 40;

// Подписи NameSheet по месту (DESIGN.md §7 NameSheet).
export const NAME_CAPTIONS = {
  wishlist: (name: string) => `Друзья увидят: «Вишлист ${genitive(name)}»`,
  plan: () => "Так тебя увидят в плане",
  santa: () => "Так тебя увидят в игре",
  pick: (name: string) => `Друг увидит: «${name} хочет подарить тебе подарок»`,
  // Бронь в чужом вишлисте — подпись прежнего вопроса из reserve-gift.
  reserve: () =>
    "Имя увидит только тот, кто тоже бронирует. Владелец вишлиста не узнает, кто что выбрал.",
} satisfies Record<string, (name: string) => string>;
