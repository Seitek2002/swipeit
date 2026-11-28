"use client";

import { useState } from "react";

import { BottomSheet, Button, Chip } from "@/shared/ui";

import { type SantaPair, type SantaPerson, pairBlocked } from "../exclusions";

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((item) => item !== value)
    : [...list, value];
}

type Props = {
  // Пары, которые уже есть: с ними второго выбрать нельзя.
  exclusions: readonly SantaPair[];
  onAdd: (pair: SantaPair) => void;
  onClose: () => void;
  open: boolean;
  people: readonly SantaPerson[];
};

// «Эти двое не дарят друг другу» (DESIGN.md §8.8): выбрать двоих из игры —
// при создании из позванных друзей, на экране игры (R03) — из вступивших и
// позванных.
export const PairSheet = ({
  open,
  people,
  exclusions,
  onClose,
  onAdd,
}: Props) => {
  const [picked, setPicked] = useState<string[]>([]);
  return (
    <BottomSheet
      open={open}
      onClose={() => {
        setPicked([]);
        onClose();
      }}
      title="Эти двое не дарят друг другу"
      footer={
        <Button
          size="lg"
          disabled={picked.length !== 2}
          onClick={() => {
            const [a, b] = picked;
            if (a && b) onAdd([a, b]);
            setPicked([]);
          }}
        >
          Добавить пару
        </Button>
      }
    >
      <p className="text-body text-rose mb-4">
        Например, пара или те, кто и так дарит друг другу. Выбери двоих.
      </p>
      <div className="flex flex-wrap gap-2 pb-2">
        {people.map((person) => (
          <Chip
            key={person.id}
            selected={picked.includes(person.id)}
            disabled={pairBlocked(person.id, picked, exclusions)}
            onClick={() => setPicked((list) => toggle(list, person.id))}
          >
            {person.name}
          </Chip>
        ))}
      </div>
    </BottomSheet>
  );
};
