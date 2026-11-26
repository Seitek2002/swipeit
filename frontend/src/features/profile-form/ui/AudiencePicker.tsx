"use client";

import { AUDIENCES, AUDIENCE_LABELS, type Audience } from "@/shared/config";
import { SegmentedControl } from "@/shared/ui";

type Props = {
  onChange: (audience: Audience) => void;
  value: Audience;
};

// «Показывать подарки: всем / для неё / для него» (DESIGN.md §8.1).
export const AudiencePicker = ({ value, onChange }: Props) => (
  <div className="flex flex-col gap-2">
    <p className="text-caption text-rose">Показывать подарки</p>
    <SegmentedControl
      label="Показывать подарки"
      value={value}
      onChange={onChange}
      options={AUDIENCES.map((audience) => ({
        value: audience,
        label: AUDIENCE_LABELS[audience],
      }))}
    />
  </div>
);
