"use client";

import { cn } from "@/shared/lib/utils";
import { Chip } from "@/shared/ui";

import type { VariantGroup } from "../model";

type Props = {
  choice: Record<string, string>;
  groups: VariantGroup[];
  onChoose: (group: VariantGroup, optionId: string) => void;
};

// Выбор варианта (DESIGN.md §8.2): цвета — кружки-сваточи 44px, размеры и
// прочее — чипы. Общий для «Подробнее» и вишлиста.
export const VariantPicker = ({ groups, choice, onChoose }: Props) => (
  <div className="flex flex-col gap-3">
    {groups.map((group) => (
      <div key={group.id}>
        <p className="text-caption text-rose mb-2">{group.label}</p>
        {group.kind === "color" &&
        group.options.every((option) => option.hex) ? (
          <div
            role="group"
            aria-label={group.label}
            className="flex flex-wrap gap-1"
          >
            {group.options.map((option) => {
              const selected = choice[group.id] === option.id;
              return (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={selected}
                  aria-label={option.label}
                  onClick={() => onChoose(group, option.id)}
                  className="grid size-11 place-items-center rounded-full"
                >
                  <i
                    className={cn(
                      "ease-out-soft size-8 rounded-full shadow-[inset_0_0_0_1px_rgb(42_16_36/0.25)] transition-shadow duration-200",
                      selected &&
                        "shadow-[inset_0_0_0_1px_rgb(42_16_36/0.25),0_0_0_2px_var(--color-velvet-2),0_0_0_4px_var(--color-paper)]",
                    )}
                    style={{ background: option.hex }}
                  />
                </button>
              );
            })}
          </div>
        ) : (
          <div
            role="group"
            aria-label={group.label}
            className="flex flex-wrap gap-2"
          >
            {group.options.map((option) => (
              <Chip
                key={option.id}
                selected={choice[group.id] === option.id}
                onClick={() => onChoose(group, option.id)}
              >
                {option.label}
              </Chip>
            ))}
          </div>
        )}
      </div>
    ))}
  </div>
);
