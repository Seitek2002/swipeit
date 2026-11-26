"use client";

import { Chip, TextField } from "@/shared/ui";

import type { Occasion } from "../model";

type Kind = Occasion["kind"];

const KINDS: Array<{ kind: Kind; label: string }> = [
  { kind: "birthday", label: "День рождения" },
  { kind: "new_year", label: "Новый год" },
  { kind: "just_because", label: "Просто так" },
  { kind: "custom", label: "Свой вариант" },
];

// Черновик повода в форме: строки как в полях ввода.
export type OccasionDraft = { date: string; kind: Kind | null; label: string };

export const occasionDraftOf = (occasion?: Occasion): OccasionDraft => ({
  kind: occasion?.kind ?? null,
  label: occasion?.label ?? "",
  date: occasion?.date ?? "",
});

export const occasionFromDraft = (draft: OccasionDraft): null | Occasion =>
  draft.kind
    ? {
        kind: draft.kind,
        label:
          draft.kind === "custom" ? draft.label.trim() || undefined : undefined,
        date: draft.date || undefined,
      }
    : null;

type Props = {
  onChange: (draft: OccasionDraft) => void;
  value: OccasionDraft;
};

// Повод и дата (DESIGN.md §8.4, §8.6): одинаковые поля в отправке вишлиста и
// в ссылке-фильтре.
export const OccasionFields = ({ value, onChange }: Props) => (
  <>
    <div>
      <p className="text-caption text-rose mb-2">Повод</p>
      <div role="group" aria-label="Повод" className="flex flex-wrap gap-2">
        {KINDS.map((option) => (
          <Chip
            key={option.kind}
            selected={value.kind === option.kind}
            onClick={() =>
              onChange({
                ...value,
                kind: value.kind === option.kind ? null : option.kind,
              })
            }
          >
            {option.label}
          </Chip>
        ))}
      </div>
    </div>
    {value.kind === "custom" && (
      <TextField
        label="Какой повод"
        placeholder="Например, на новоселье"
        maxLength={60}
        value={value.label}
        onChange={(event) => onChange({ ...value, label: event.target.value })}
      />
    )}
    <TextField
      label="Дата, если есть"
      type="date"
      value={value.date}
      onChange={(event) => onChange({ ...value, date: event.target.value })}
    />
  </>
);
