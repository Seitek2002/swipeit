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
