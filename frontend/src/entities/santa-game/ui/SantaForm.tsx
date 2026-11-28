"use client";

import { clock } from "@/shared/lib/clock";
import { formatNumber, toDateKey } from "@/shared/lib/format";
import { Chip, SegmentedControl, TextField } from "@/shared/ui";

import {
  BUDGET_HINTS,
  type SantaFormValues,
  budgetError,
  parseBudget,
  toLocalInput,
} from "../form";

type Props = {
  onChange: (values: SantaFormValues) => void;
  // После жеребьёвки менять можно только дату обмена (R03).
  onlyExchangeDate?: boolean;
  values: SantaFormValues;
};

// Поля игры (DESIGN.md §8.8) — общие у «Новой игры» и «Изменить игру»
// (R03): название, бюджет с подсказками 1 000 / 2 000 / 3 000 / 5 000, дата
// обмена, жеребьёвка «Когда все соберутся» или «По дате».
export const SantaForm = ({ values, onChange, onlyExchangeDate }: Props) => {
  const set = (patch: Partial<SantaFormValues>) =>
    onChange({ ...values, ...patch });
  const budgetValue = parseBudget(values.budget);
  const exchange = (
    <TextField
      label="Обмен подарками"
      type="date"
      value={values.exchangeDate}
      min={toDateKey(clock.now())}
      onChange={(event) => set({ exchangeDate: event.target.value })}
    />
  );
  if (onlyExchangeDate) return exchange;
  return (
    <div className="flex flex-col gap-6">
      <TextField
        label="Название"
        placeholder="Новый год в офисе"
        maxLength={60}
        value={values.title}
        onChange={(event) => set({ title: event.target.value })}
      />
      <div className="flex flex-col gap-2.5">
        <TextField
          label="Бюджет подарка, сом"
          inputMode="numeric"
          value={values.budget}
          error={budgetError(values.budget)}
          onChange={(event) => set({ budget: event.target.value })}
        />
        <div className="flex flex-wrap gap-2">
          {BUDGET_HINTS.map((hint) => (
            <Chip
              key={hint}
              selected={budgetValue === hint}
              onClick={() => set({ budget: String(hint) })}
            >
              {formatNumber(hint)}
            </Chip>
          ))}
        </div>
      </div>
      {exchange}
      <div className="flex flex-col gap-3">
        <p className="text-caption text-rose">Жеребьёвка</p>
        <SegmentedControl
          label="Жеребьёвка"
          value={values.drawMode}
          onChange={(drawMode) => set({ drawMode })}
          options={[
            { value: "manual", label: "Когда все соберутся" },
            { value: "date", label: "По дате" },
          ]}
        />
        {values.drawMode === "date" && (
          <TextField
            label="Когда провести"
            type="datetime-local"
            value={values.drawAt}
            min={toLocalInput(clock.now())}
            onChange={(event) => set({ drawAt: event.target.value })}
          />
        )}
      </div>
    </div>
  );
};
