// Исключения Тайного Санты — «Эти двое не дарят друг другу» (DESIGN.md
// §8.8). Пара действует в обе стороны: [A, B] и [B, A] — одна и та же.

export type SantaPair = [string, string];

export type SantaPerson = { avatarColor: string; id: string; name: string };

export const samePair = (a: SantaPair, b: SantaPair) =>
  (a[0] === b[0] && a[1] === b[1]) || (a[0] === b[1] && a[1] === b[0]);

// Добавить пару без повтора (в том числе в обратную сторону).
export const withPair = (
  list: readonly SantaPair[],
  pair: SantaPair,
): SantaPair[] =>
  list.some((item) => samePair(item, pair)) ? [...list] : [...list, pair];

export const withoutPair = (
  list: readonly SantaPair[],
  pair: SantaPair,
): SantaPair[] => list.filter((item) => !samePair(item, pair));

// Пары, где оба ещё в игре: убрали человека — его пары не показываем и не
// отправляем.
export const pairsAmong = (
  list: readonly SantaPair[],
  people: readonly Pick<SantaPerson, "id">[],
): SantaPair[] => {
  const ids = new Set(people.map((person) => person.id));
  return list.filter(([a, b]) => ids.has(a) && ids.has(b));
};

// Кого в шторке выбрать уже нельзя (R03): двое уже выбраны — остальные;
// выбран один — те, с кем у него уже есть пара. Иначе «Добавить пару»
// ничего бы не добавила.
export const pairBlocked = (
  personId: string,
  picked: readonly string[],
  list: readonly SantaPair[],
): boolean => {
  if (picked.includes(personId)) return false;
  if (picked.length >= 2) return true;
  const [first] = picked;
  return (
    first !== undefined &&
    list.some((item) => samePair(item, [first, personId]))
  );
};

// Есть ли из кого составить новую пару: хотя бы двое, и не все пары уже
// исключены.
export const canAddPair = (
  people: readonly Pick<SantaPerson, "id">[],
  list: readonly SantaPair[],
): boolean => {
  const all = (people.length * (people.length - 1)) / 2;
  return people.length >= 2 && pairsAmong(list, people).length < all;
};

// Люди игры для исключений (R03): себя — «Ты», как в списке участников.
export const santaPeople = (
  members: readonly SantaPerson[],
  meId: null | string | undefined,
): SantaPerson[] =>
  members.map((member) => ({
    id: member.id,
    name: member.id === meId ? "Ты" : member.name,
    avatarColor: member.avatarColor,
  }));
