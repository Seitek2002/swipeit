import type {
  CreateDateInput,
  ImportantDate,
  ImportantDateView,
  UpdateDateInput,
} from "@/shared/api";

// Что отправить после правки названия в строке (DESIGN.md §8.9). null —
// отправлять нечего: название не поменялось, или поле очистили у даты, у
// которой и так нет своего названия (сервер всё равно вернул бы то же).
// Пустое поле — label: null: сервер вернёт подпись готового повода или
// «Значимая дата N».
export const renamePatch = (
  draft: string,
  date: Pick<ImportantDateView, "label" | "title">,
): null | UpdateDateInput => {
  const next = draft.trim();
  if (!next) return date.label ? { label: null } : null;
  if (next === date.title) return null;
  return { label: next };
};

// «Отменить» после удаления: та же дата, тот же повод и название, и тот же
// номер «Значимой даты N» — сервер оставит его, если он ещё свободен.
export const undoInput = (
  date: Pick<ImportantDate, "autoNumber" | "date" | "label" | "preset">,
): CreateDateInput => ({
  date: date.date,
  ...(date.preset ? { preset: date.preset } : {}),
  ...(date.label ? { label: date.label } : {}),
  autoNumber: date.autoNumber,
});

// Кэш списка: ответ PATCH сразу встаёт на место старой строки, удалённая
// строка сразу пропадает — не ждём перечитывания списка.
export const replaceDate = (
  list: readonly ImportantDateView[] | undefined,
  next: ImportantDateView,
): ImportantDateView[] | undefined =>
  list?.map((item) => (item.id === next.id ? next : item));

export const removeDate = (
  list: readonly ImportantDateView[] | undefined,
  id: string,
): ImportantDateView[] | undefined => list?.filter((item) => item.id !== id);
