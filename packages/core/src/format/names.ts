// Родительный падеж имени для подписи «от Азамата» (DESIGN.md §8.3). Без
// словарей — простые правила для имён из демо и самых частых окончаний.
// Женские имена на согласную (Айгерим, Мээрим, Нурай) не склоняются, поэтому
// пол важен; если он неизвестен, имя на согласную оставляем как есть.
const HUSHING = /[гкхжшщч]$/i;

export const genitive = (name: string, gender?: "female" | "male"): string => {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const last = trimmed.slice(-1).toLowerCase();
  const stem = trimmed.slice(0, -1);
  if (last === "а") return stem + (HUSHING.test(stem) ? "и" : "ы");
  if (last === "я") return `${stem}и`;
  if (gender !== "male") return trimmed;
  if (last === "й") return `${stem}я`;
  if (last === "ь") return `${stem}я`;
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(last)) return `${trimmed}а`;
  return trimmed;
};

// Дательный падеж для «Отправить выбор Азамату» (DESIGN.md §8.6) — те же
// правила: женские имена на согласную не склоняются, без пола — тоже.
export const dative = (name: string, gender?: "female" | "male"): string => {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;
  const last = trimmed.slice(-1).toLowerCase();
  const stem = trimmed.slice(0, -1);
  if (/ия$/i.test(trimmed)) return `${stem}и`;
  if (last === "а" || last === "я") return `${stem}е`;
  if (gender !== "male") return trimmed;
  if (last === "й" || last === "ь") return `${stem}ю`;
  if (/[бвгджзклмнпрстфхцчшщ]$/i.test(last)) return `${trimmed}у`;
  return trimmed;
};

// Тёзки (auto-tasks-pm-3 R04): одно имя без регистра и пробелов по краям,
// «ё» = «е». «Азамат» и «Азамат К.» — разные: так человек и различается.
export const sameName = (a: string, b: string): boolean => {
  const norm = (name: string) =>
    name.trim().toLocaleLowerCase("ru").replaceAll("ё", "е");
  return norm(a) !== "" && norm(a) === norm(b);
};

// Есть ли среди имён тёзки.
export const hasNamesakes = (names: readonly string[]): boolean =>
  names.some((name, index) =>
    names.slice(index + 1).some((other) => sameName(name, other)),
  );
