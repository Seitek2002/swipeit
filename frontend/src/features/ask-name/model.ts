import { genitive, sameName } from "@/shared/lib/format";

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

// Первый человек с тем же именем, кроме меня, — для подписи «В игре уже
// есть Азамат» (R04). Сравнение имён — общее с сервером (core sameName).
export const findNamesake = <T extends { id: string; name: string }>(
  people: readonly T[],
  name: string,
  meId?: null | string,
): T | undefined =>
  people.find((person) => person.id !== meId && sameName(person.name, name));

// Тёзка уже в игре или плане (auto-tasks-pm-3 R04): чаще всего это тот же
// человек со второго телефона или из встроенного браузера мессенджера —
// тогда в Санте ему достались бы два подопечных. Вступить можно и так.
export const namesakeText = (name: string, place: "plan" | "santa") =>
  place === "santa"
    ? `В игре уже есть ${name}. Если это ты с другого телефона или браузера — открой игру там, где вступал. Если нет — добавь первую букву фамилии, чтобы Санта не перепутал`
    : `В плане уже есть ${name}. Если это ты с другого телефона или браузера — открой план там, где вступал. Если нет — добавь первую букву фамилии`;
