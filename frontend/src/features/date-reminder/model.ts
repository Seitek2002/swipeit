import type { Reminder } from "@/shared/api";
import { formatDayMonth, pluralize } from "@/shared/lib/format";

const DAYS = ["день", "дня", "дней"] as const;

// «Через 26 дней», а за день и в сам день — «Завтра» и «Сегодня»: «через
// 1 день» и «через 0 дней» так никто не говорит (DESIGN.md §7 ReminderBanner).
export const reminderWhen = (daysLeft: number): string => {
  if (daysLeft <= 0) return "Сегодня";
  if (daysLeft === 1) return "Завтра";
  return `Через ${pluralize(daysLeft, DAYS)}`;
};

// Текст баннера: «Через 26 дней твой день рождения» — дата своего дня
// рождения человеку не нужна; «Через 26 дней — Годовщина, 2 июня» — у
// значимой даты название и дата, потому что название бывает «Значимая дата 1».
// label приходит с сервера: «твой день рождения» или название даты.
export const reminderText = (
  reminder: Pick<Reminder, "date" | "daysLeft" | "kind" | "label">,
): string => {
  const when = reminderWhen(reminder.daysLeft);
  if (reminder.kind === "birthday") return `${when} ${reminder.label}`;
  const date = formatDayMonth(reminder.date);
  return `${when} — ${[reminder.label, date].filter(Boolean).join(", ")}`;
};
