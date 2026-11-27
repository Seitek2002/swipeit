"use client";

import {
  INTEREST_IDS,
  INTEREST_LABELS,
  type InterestId,
} from "@/shared/config";
import { Chip } from "@/shared/ui";

type Props = {
  onChange: (interests: string[]) => void;
  value: string[];
};

// Облако из 20 чипов-интересов (DESIGN.md §8.1). По ним подбирается лента.
export const InterestsPicker = ({ value, onChange }: Props) => {
  const toggle = (id: InterestId) =>
    onChange(
      value.includes(id) ? value.filter((item) => item !== id) : [...value, id],
    );

  return (
    <div className="flex flex-col gap-3">
      <div role="group" aria-label="Интересы" className="flex flex-wrap gap-2">
        {INTEREST_IDS.map((id) => (
          <Chip
            key={id}
            selected={value.includes(id)}
            onClick={() => toggle(id)}
          >
            {INTEREST_LABELS[id]}
          </Chip>
        ))}
      </div>
    </div>
  );
};
