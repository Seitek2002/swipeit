"use client";

import { type ChangeEvent, useId } from "react";

import { ChevronDown } from "lucide-react";

import { cn } from "@/shared/lib/utils";

import { DAYS_IN_MONTH, MONTHS_GENITIVE } from "../model";

type Props = {
  day: string;
  error?: string;
  month: string;
  onChange: (value: { day: string; month: string }) => void;
};

const selectClass =
  "bg-velvet-3 text-paper rounded-field focus-visible:border-mandarin h-[52px] w-full appearance-none border-[1.5px] border-transparent pr-10 pl-4 text-[17px] leading-[22px] outline-none";

// Дата рождения без года (DESIGN.md §8.1): день и месяц — нативные списки,
// на телефоне это привычное колесо. Необязательно.
export const BirthdayPicker = ({ day, month, error, onChange }: Props) => {
  const id = useId();
  const maxDay = month ? (DAYS_IN_MONTH[Number(month) - 1] ?? 31) : 31;

  const handleMonth = (event: ChangeEvent<HTMLSelectElement>) => {
    const nextMonth = event.target.value;
    const limit = nextMonth ? (DAYS_IN_MONTH[Number(nextMonth) - 1] ?? 31) : 31;
    // 31 → февраль: день подрезаем, а не оставляем несуществующую дату.
    const nextDay = day && Number(day) > limit ? String(limit) : day;
    onChange({ day: nextDay, month: nextMonth });
  };

  return (
    <fieldset className="flex flex-col gap-2" aria-describedby={`${id}-hint`}>
      <legend className="text-caption text-rose mb-2">Дата рождения</legend>
      <div className="grid grid-cols-[1fr_1.6fr] gap-2">
        <div className="relative">
          <select
            aria-label="День"
            value={day}
            onChange={(event) => onChange({ day: event.target.value, month })}
            className={cn(
              selectClass,
              error && "border-pomegranate",
              !day && "text-rose",
            )}
          >
            <option value="">День</option>
            {Array.from({ length: maxDay }, (_, index) => (
              <option key={index + 1} value={String(index + 1)}>
                {index + 1}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            size={18}
            strokeWidth={1.75}
            className="text-rose pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2"
          />
        </div>
        <div className="relative">
          <select
            aria-label="Месяц"
            value={month}
            onChange={handleMonth}
            className={cn(
              selectClass,
              error && "border-pomegranate",
              !month && "text-rose",
            )}
          >
            <option value="">Месяц</option>
            {MONTHS_GENITIVE.map((name, index) => (
              <option key={name} value={String(index + 1)}>
                {name}
              </option>
            ))}
          </select>
          <ChevronDown
            aria-hidden
            size={18}
            strokeWidth={1.75}
            className="text-rose pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2"
          />
        </div>
      </div>
      {error ? (
        <p className="text-caption text-pomegranate">{error}</p>
      ) : (
        <p id={`${id}-hint`} className="text-caption text-rose">
          Необязательно — чтобы друзья не пропустили
        </p>
      )}
    </fieldset>
  );
};
