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
