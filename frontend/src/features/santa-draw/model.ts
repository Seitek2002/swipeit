import { type SantaMember, memberWishlistStatus } from "@/entities/santa-game";

import { sameName } from "@/shared/lib/format";

// Самая первая группа тёзок среди вступивших (auto-tasks-pm-3 R04): чаще
// всего это один человек с двух телефонов или из встроенного браузера
// мессенджера — после жеребьёвки ему достались бы два подопечных. Имя —
// как его вписал первый из группы; групп несколько — говорим о первой:
// организатор уберёт лишнего, и подпись покажет следующую.
export const namesakeGroup = (
  names: readonly string[],
): { count: number; name: string } | null => {
  for (const [index, name] of names.entries()) {
    const count =
      1 +
      names.slice(index + 1).filter((other) => sameName(name, other)).length;
    if (count > 1) return { count, name: name.trim() };
  }
  return null;
};

// Число словом до четырёх: «В игре два „Азамат“», дальше — цифрой.
const COUNT_WORDS: Record<number, string> = { 2: "два", 3: "три", 4: "четыре" };

// Подпись над «Провести жеребьёвку» и строка в её подтверждении. Имя в
// кавычках и именительном — без пола его не просклонять (core genitive).
// Жеребьёвку не блокируем: тёзки бывают и настоящими.
export const namesakeNote = (names: readonly string[]): null | string => {
  const group = namesakeGroup(names);
  if (!group) return null;
  const count = COUNT_WORDS[group.count] ?? String(group.count);
  return `В игре ${count} „${group.name}“. Если это один человек с двух телефонов — убери лишнего, иначе ему достанутся два подопечных`;
};

// Сколько пар исключений называем в подтверждении — дальше «и ещё N».
const MAX_PAIRS = 2;

// Строка про исключения в подтверждении жеребьёвки (Y04): для офиса с
// парами и семьи это главный вопрос перед жеребьёвкой — пары потом не
// поменять. pairs — имена уже в нужном виде («Ты» для себя).
export const exclusionsLine = (
  pairs: ReadonlyArray<readonly [string, string]>,
): string => {
  if (pairs.length === 0) {
    return "Исключений нет: пара может выпасть друг другу";
  }
  const named = pairs
    .slice(0, MAX_PAIRS)
    .map(([a, b]) => `${a} ⇄ ${b}`)
    .join(", ");
  const rest = pairs.length - MAX_PAIRS;
  return rest > 0 ? `Учтём: ${named} и ещё ${rest}` : `Учтём: ${named}`;
};

// Сколько имён называем в строке про вишлисты — дальше «и ещё N».
const MAX_WISHLIST_NAMES = 3;

const someNames = (names: readonly string[]) =>
  names.length > MAX_WISHLIST_NAMES
    ? `${names.slice(0, MAX_WISHLIST_NAMES).join(", ")} и ещё ${names.length - MAX_WISHLIST_NAMES}`
    : names.join(", ");

export type WishlistGaps = {
  // 1–2 желания в бюджете.
  few: readonly string[];
  // Ни одного в бюджете.
  none: readonly string[];
};

// Кто из вступивших не готов (Z03) — по тому же правилу core, что строка
// участника и подсказка «Собери вишлист». Себя — «ты»: после двоеточия
// со строчной.
export const wishlistGaps = (
  joined: ReadonlyArray<
    Pick<SantaMember, "hasWishlist" | "id" | "name" | "wishesInBudget">
  >,
  meId: string,
): WishlistGaps => {
  const nameOf = (member: { id: string; name: string }) =>
    member.id === meId ? "ты" : member.name;
  const of = (status: "few" | "none") =>
    joined
      .filter((member) => memberWishlistStatus(member) === status)
      .map(nameOf);
  return { none: of("none"), few: of("few") };
};

// «Без вишлиста: Бекзат. Мало в бюджете: ты.» — имена, а не число (Z03):
// организатор видит, кому напомнить до жеребьёвки.
export const wishlistsLine = ({ none, few }: WishlistGaps): string => {
  if (none.length === 0 && few.length === 0) return "У всех вишлисты готовы.";
  return [
    none.length > 0 && `Без вишлиста: ${someNames(none)}.`,
    few.length > 0 && `Мало в бюджете: ${someNames(few)}.`,
  ]
    .filter(Boolean)
    .join(" ");
};

// Текст ConfirmDialog «Провести жеребьёвку?»: пары потом не поменять, кто
// без вишлиста или с малым в бюджете (Z03), какие исключения учтём (Y04) и
// — при тёзках — та же строка, что над кнопкой.
export const drawConfirmText = ({
  wishlists,
  namesakes,
  exclusions,
}: {
  exclusions: ReadonlyArray<readonly [string, string]>;
  namesakes: null | string;
  wishlists: WishlistGaps;
}): string =>
  [
    "Поменять пары потом нельзя.",
    wishlistsLine(wishlists),
    `${exclusionsLine(exclusions)}.`,
    namesakes && `${namesakes}.`,
  ]
    .filter(Boolean)
    .join(" ");
