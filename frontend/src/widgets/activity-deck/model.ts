import { plural, pluralize } from "@/shared/lib/format";

// «Азамат, Нурай и Данияр» — для «листают вместе с тобой» и «ещё листают».
export const joinNames = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;

// Кто не долистал колоду и сколько карточек ему осталось.
export type Lagging = { left: number; name: string };

// Больше пяти имён в сообщении для чата не читают — остальных одним
// «и ещё 2».
const MAX_NAMED = 5;

// Текст «Напомнить» для чата (auto-tasks-ux-4 X06): по имени и с тем,
// сколько осталось, — «долистай, тут 5 карточек» действует лучше, чем
// ссылка-приглашение, которую человек уже открывал. Одному — сколько
// осталось ему, нескольким — сколько у самого отстающего.
export const remindText = (
  lagging: readonly Lagging[],
  title: string,
): string => {
  const names = lagging.map((person) => person.name);
  const who =
    names.length > MAX_NAMED
      ? `${names.slice(0, MAX_NAMED).join(", ")} и ещё ${names.length - MAX_NAMED}`
      : joinNames(names);
  const most = Math.max(0, ...lagging.map((person) => person.left));
  if (lagging.length === 1) {
    const verb = plural(most, ["осталась", "осталось", "осталось"]);
    const cards = pluralize(most, ["карточка", "карточки", "карточек"]);
    return `${who}, долистай «${title}» — ${verb} ${cards}`;
  }
  // «не больше» — с родительным: «1 карточки», «2 карточек».
  const cards = pluralize(most, ["карточки", "карточек", "карточек"]);
  return `${who}, долистайте «${title}» — осталось не больше ${cards}`;
};
