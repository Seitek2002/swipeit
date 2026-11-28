import { plural, pluralize } from "@/shared/lib/format";

// ?invite=1 у экрана плана — сразу после «Начать» в «До даты» открыть
// «Отправь план в чат» (auto-tasks-ux-5 Y01).
export const PLAN_INVITE_PARAM = "invite";

// «Азамат, Нурай и Данияр» — для «листают вместе с тобой» и «ещё листают».
export const joinNames = (names: readonly string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;

// Кто не долистал колоду и сколько карточек ему осталось. started — открывал
// ли колоду вообще: у того, у кого 0 карточек, — «ещё не открывали»
// (auto-tasks-ux-5 Y08), а не «листают».
export type Lagging = { left: number; name: string; started: boolean };

// Больше пяти имён в сообщении для чата не читают — остальных одним
// «и ещё 2».
const MAX_NAMED = 5;

const namesOf = (names: readonly string[], join = joinNames) =>
  names.length > MAX_NAMED
    ? `${names.slice(0, MAX_NAMED).join(", ")} и ещё ${names.length - MAX_NAMED}`
    : join(names);

const byComma = (names: readonly string[]) => names.join(", ");

// Сколько минут на колоду: карточка — секунды две-три, 50 карточек — 2
// минуты. Меньше минуты не обещаем.
const SECONDS_PER_CARD = 2.4;

export const swipeMinutes = (cards: number): number =>
  Math.max(1, Math.round((cards * SECONDS_PER_CARD) / 60));

const CARDS = ["карточка", "карточки", "карточек"] as const;

// «пара минут» — пока колода короткая; длинной — честно «4 минуты».
const howLong = (cards: number) => {
  const minutes = swipeMinutes(cards);
  return minutes <= 2
    ? "пара минут"
    : pluralize(minutes, ["минута", "минуты", "минут"]);
};

// Тем, кто план ещё не открывал (Y08): «долистайте — осталось не больше 50»
// звучало так, будто их уже звали и они бросили.
const freshPart = (fresh: readonly Lagging[], tail: string) => {
  const cards = Math.max(0, ...fresh.map((person) => person.left));
  const verb = fresh.length === 1 ? "полистай" : "полистайте";
  return `${namesOf(
    fresh.map((person) => person.name),
    byComma,
  )}, ${verb}${tail} — ${pluralize(cards, CARDS)}, ${howLong(cards)}`;
};

// Текст «Напомнить» для чата (auto-tasks-ux-4 X06): по имени и с тем,
// сколько осталось, — «долистай, тут 5 карточек» действует лучше, чем
// ссылка-приглашение, которую человек уже открывал. Одному — сколько
// осталось ему, нескольким — сколько у самого отстающего. Кто ещё не
// открывал план — «полистайте … — 50 карточек, пара минут» (Y08); если
// есть и те и другие — два предложения.
export const remindText = (
  lagging: readonly Lagging[],
  title: string,
): string => {
  const started = lagging.filter((person) => person.started);
  const fresh = lagging.filter((person) => !person.started);
  if (started.length === 0) return freshPart(fresh, ` «${title}»`);

  const who = namesOf(started.map((person) => person.name));
  const most = Math.max(0, ...started.map((person) => person.left));
  let text: string;
  if (started.length === 1) {
    const verb = plural(most, ["осталась", "осталось", "осталось"]);
    text = `${who}, долистай «${title}» — ${verb} ${pluralize(most, CARDS)}`;
  } else {
    // «не больше» — с родительным: «1 карточки», «2 карточек».
    const cards = pluralize(most, ["карточки", "карточек", "карточек"]);
    text = `${who}, долистайте «${title}» — осталось не больше ${cards}`;
  }
  return fresh.length > 0 ? `${text}. ${freshPart(fresh, " тоже")}` : text;
};

const startedNames = (lagging: readonly Lagging[]) =>
  lagging.filter((person) => person.started).map((person) => person.name);

const freshNames = (lagging: readonly Lagging[]) =>
  lagging.filter((person) => !person.started).map((person) => person.name);

// Строка под кольцами в шапке колоды: «листают» — только те, кто начал;
// у кого 0 карточек — «ещё не открывали» (Y08). Своя колода кончилась —
// строки нет: кто листает и кто не открывал, пишет «Колода закончилась»
// (deckEndLines), а дважды одно и то же не нужно (auto-tasks-ux-6).
export const deckStatus = (
  others: number,
  lagging: readonly Lagging[],
  myDeckDone = false,
): null | string => {
  if (myDeckDone) return null;
  if (others === 0) return "Ты листаешь один";
  if (lagging.length === 0) return "Остальные уже всё пролистали";
  const started = startedNames(lagging);
  const fresh = freshNames(lagging);
  const parts: string[] = [];
  if (started.length > 0) {
    parts.push(
      `${namesOf(started)} ${started.length === 1 ? "листает" : "листают"} вместе с тобой`,
    );
  }
  if (fresh.length > 0) {
    parts.push(
      `${parts.length > 0 ? "ещё" : "Ещё"} не открывали: ${namesOf(fresh)}`,
    );
  }
  return parts.join(" · ");
};

// Строки «Колода закончилась»: кто ещё листает и кто план не открывал.
export const deckEndLines = (lagging: readonly Lagging[]): string[] => {
  const started = startedNames(lagging);
  const fresh = freshNames(lagging);
  return [
    ...(started.length > 0
      ? [
          `${namesOf(started)} ${started.length === 1 ? "ещё листает" : "ещё листают"}`,
        ]
      : []),
    ...(fresh.length > 0 ? [`Ещё не открывали: ${namesOf(fresh)}`] : []),
  ];
};

// Текст приглашения «Отправь план в чат» (auto-tasks-ux-5 Y01): «Листаем
// «Выходные 6–7 декабря» до 29 ноября, 20:00 — займёт 2 минуты». until —
// «до 29 ноября, 20:00» или null, если даты нет.
export const inviteText = (
  title: string,
  until: null | string,
  cards: number,
): string => {
  const minutes = swipeMinutes(cards);
  const how =
    minutes === 1
      ? "минуту"
      : pluralize(minutes, ["минуту", "минуты", "минут"]);
  return `Листаем «${title}»${until ? ` ${until}` : ""} — займёт ${how}`;
};
