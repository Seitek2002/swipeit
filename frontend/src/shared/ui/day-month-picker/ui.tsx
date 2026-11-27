"use client";

import { type KeyboardEvent, useRef, useState } from "react";

import { clock } from "@/shared/lib/clock";
import { formatBirthday } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";

import {
  MONTHS_FULL,
  MONTHS_SHORT,
  daysInMonth,
  moveDay,
  parseMonthDay,
  toMonthDay,
  withMonth,
} from "./model";

type Props = {
  className?: string;
  // Месяц, который открыт, пока день не выбран (1..12). По умолчанию —
  // текущий месяц по часам демо.
  defaultMonth?: number;
  // Пока идёт сохранение — месяцы и дни не нажимаются.
  disabled?: boolean;
  onChange: (value: string) => void;
  // "MM-DD" или null — день ещё не выбран.
  value: null | string;
};

// DayMonthPicker (DESIGN.md §7): день и месяц без года. Сверху 12 месяцев
// чипами в два ряда по 6, под ними живая подпись «14 марта» и сетка дней
// 7 колонок. Дней недели нет — год неизвестен. Кнопку «Дальше»/«Сохранить»
// рисует тот, кто встроил пикер (вариант paper: мандарин занят выбранным
// днём).
//
// Клавиатура: ячейки — roving tabindex (в сетку попадаешь одним Tab), стрелки
// двигают фокус по дням и неделям, Home/End — к краям месяца, Enter и пробел
// выбирают (это обычные button).
export const DayMonthPicker = ({
  value,
  onChange,
  defaultMonth,
  disabled = false,
  className,
}: Props) => {
  const parsed = parseMonthDay(value);
  const [viewMonth, setViewMonth] = useState(
    () => parsed?.month ?? defaultMonth ?? new Date(clock.now()).getMonth() + 1,
  );
  // Какой день доступен по Tab, пока по сетке ходят стрелками.
  const [focusDay, setFocusDay] = useState<null | number>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  // Выбранное значение главнее: месяц на экране — месяц выбранного дня.
  const month = parsed?.month ?? viewMonth;
  const maxDay = daysInMonth(month);
  const tabbableDay = Math.min(focusDay ?? parsed?.day ?? 1, maxDay);

  const pickMonth = (next: number) => {
    setViewMonth(next);
    // День уже выбран — меняется и значение: «14 марта» → «14 июня».
    if (value && parsed) onChange(withMonth(value, next));
  };

  const pickDay = (day: number) => {
    setFocusDay(day);
    onChange(toMonthDay(month, day));
  };

  const handleGridKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const current = Number(
      (event.target as HTMLElement).closest<HTMLElement>("[data-day]")?.dataset
        .day,
    );
    if (!current) return;
    const next = moveDay(current, event.key, maxDay);
    if (next === null) return;
    event.preventDefault();
    setFocusDay(next);
    gridRef.current
      ?.querySelector<HTMLButtonElement>(`[data-day="${next}"]`)
      ?.focus();
  };

  return (
    <div className={cn("flex flex-col", className)}>
      {/* Все 12 месяцев видны сразу (UX-аудит 27.11.2026, M6): в ряду с
          прокруткой январь–июнь уезжали за левый край, и мартовский день
          рождения приходилось искать. На 360px ячейка ~46px: Check
          выбранного чипа не помещается рядом с «сен», выбранный узнаётся по
          «Бумаге». Зона нажатия — 44px по высоте (before), как у Chip. */}
      <div
        role="group"
        aria-label="Месяц"
        className="grid grid-cols-6 gap-2 py-1"
      >
        {MONTHS_SHORT.map((short, index) => {
          const selected = index + 1 === month;
          return (
            <button
              key={short}
              type="button"
              aria-pressed={selected}
              aria-label={MONTHS_FULL[index]}
              disabled={disabled}
              onClick={() => pickMonth(index + 1)}
              className={cn(
                "rounded-chip ease-out-soft relative h-9 min-w-0 text-[14px] leading-none font-medium transition-[background-color,color] duration-200 before:absolute before:inset-x-0 before:-inset-y-1 before:content-[''] disabled:pointer-events-none",
                selected ? "bg-paper text-ink" : "bg-velvet-3 text-paper",
              )}
            >
              {short}
            </button>
          );
        })}
      </div>

      <p className="text-title-3 text-paper mt-4 mb-2.5" aria-live="polite">
        {parsed
          ? formatBirthday(toMonthDay(parsed.month, parsed.day))
          : "Выбери день"}
      </p>

      <div
        ref={gridRef}
        role="group"
        aria-label="День"
        onKeyDown={handleGridKey}
        className="grid grid-cols-[repeat(7,44px)] justify-between gap-y-1.5"
      >
        {Array.from({ length: maxDay }, (_, index) => {
          const day = index + 1;
          const selected = parsed?.day === day && parsed.month === month;
          return (
            <button
              key={day}
              type="button"
              data-day={day}
              aria-label={formatBirthday(toMonthDay(month, day))}
              aria-pressed={selected}
              tabIndex={day === tabbableDay ? 0 : -1}
              disabled={disabled}
              onClick={() => pickDay(day)}
              className={cn(
                "ease-out-soft grid size-11 place-items-center rounded-[12px] text-[15px] leading-none tabular-nums transition-colors duration-200 disabled:pointer-events-none",
                selected
                  ? "bg-mandarin text-ink font-semibold"
                  : "text-paper hover:bg-velvet-3 font-medium",
              )}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
};
