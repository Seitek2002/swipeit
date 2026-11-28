// Подпись строки итогов (UX-аудит W05). После «Показать итоги сейчас»
// считаются только долиставшие — так и пишем: «2 из 2 долиставших — все
// за», а не «2 из 4 — большинство за» при правиле «Все за».
export const resultNote = (
  kind: "almost" | "match",
  likes: number,
  total: number,
  closedEarly: boolean,
): string => {
  const of = closedEarly
    ? `${likes} из ${total} долиставших`
    : `${likes} из ${total}`;
  if (kind === "almost") return `${of} — «Почти»`;
  if (likes === total) {
    return closedEarly ? `${of} — все за` : `все ${total} — «Все за»`;
  }
  return `${of} — большинство за`;
};

// Подписи итогов плана по тому, из чего крутит барабан (auto-tasks P12):
// полных совпадений нет — честно говорим, что выбираем среди «Почти», иначе
// «Совпало 0 из 24» и «Крутить барабан» выглядят как ошибка приложения.
export type DrumSource = "almost" | "matches" | "none";

export type DrumLabels = {
  // Кнопка организатора.
  button: string;
  // Подпись участникам, которые барабан не крутят.
  forGuests: string;
  // Пояснение под «Совпало N из M»; null — не нужно.
  hint: null | string;
};

export const drumLabels = (source: DrumSource): DrumLabels =>
  source === "almost"
    ? {
        hint: "Полных совпадений нет, ближе всего — эти",
        button: "Крутить среди «Почти»",
        forGuests:
          "Барабан крутит организатор среди «Почти» — все увидят, что выпало.",
      }
    : {
        hint: null,
        button: "Крутить барабан",
        forGuests: "Барабан крутит организатор — все увидят, что выпало.",
      };

// «Выбрать самим»: кто уже проголосовал (auto-tasks-ux-4 X04). Голос
// считается, только если он за одного из кандидатов — как у tallyVotes.
export type VoteProgress = {
  total: number;
  voted: number;
  // Имена тех, кто ещё не проголосовал, в порядке участников.
  waiting: string[];
};

export const voteProgress = (
  participants: ReadonlyArray<{ id: string; name: string }>,
  votes: Readonly<Record<string, string>>,
  candidates: readonly string[],
): VoteProgress => {
  const allowed = new Set(candidates);
  const waiting = participants.filter((person) => {
    const vote = votes[person.id];
    return vote === undefined || !allowed.has(vote);
  });
  return {
    total: participants.length,
    voted: participants.length - waiting.length,
    waiting: waiting.map((person) => person.name),
  };
};

// Больше пяти имён в одной строке не читают — «и ещё 2».
const MAX_NAMED = 5;

const namesOf = (names: readonly string[]) =>
  names.length > MAX_NAMED
    ? `${names.slice(0, MAX_NAMED).join(", ")} и ещё ${names.length - MAX_NAMED}`
    : names.join(", ");

// Строка над списком голосования: «Проголосовали 1 из 4 · ждём: Азамат,
// Тимур, Мээрим» — организатор видит, кого ждать, а не утверждает вслепую.
export const voteStatus = ({ voted, total, waiting }: VoteProgress): string =>
  waiting.length === 0
    ? "Все проголосовали"
    : `Проголосовали ${voted} из ${total} · ждём: ${namesOf(waiting)}`;

// Подтверждение «Утвердить», пока проголосовали не все; все — null, кнопка
// утверждает сразу.
export const approveWarning = ({ waiting }: VoteProgress): null | string =>
  waiting.length === 0
    ? null
    : `Не все проголосовали (ждём: ${namesOf(waiting)}). Утвердить сейчас?`;
