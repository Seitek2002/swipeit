import { pluralize, sameName } from "@/shared/lib/format";

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

// Текст ConfirmDialog «Провести жеребьёвку?»: пары потом не поменять, кто
// без вишлиста, какие исключения учтём (Y04) и — при тёзках — та же
// строка, что над кнопкой.
export const drawConfirmText = ({
  withoutWishlist,
  namesakes,
  exclusions,
}: {
  exclusions: ReadonlyArray<readonly [string, string]>;
  namesakes: null | string;
  withoutWishlist: number;
}): string => {
  const wishlists =
    withoutWishlist > 0
      ? `${pluralize(withoutWishlist, ["участник", "участника", "участников"])} ещё без вишлиста.`
      : "У всех вишлисты готовы.";
  return [
    "Поменять пары потом нельзя.",
    wishlists,
    `${exclusionsLine(exclusions)}.`,
    namesakes && `${namesakes}.`,
  ]
    .filter(Boolean)
    .join(" ");
};
