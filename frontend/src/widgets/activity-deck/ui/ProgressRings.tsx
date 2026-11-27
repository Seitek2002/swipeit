"use client";

import type { PlanParticipant } from "@/entities/plan";

import { Avatar } from "@/shared/ui";

type Props = {
  // userId → сколько карточек пролистал.
  done: Record<string, number>;
  participants: PlanParticipant[];
  total: number;
};

// Участники с кольцами прогресса (DESIGN.md §8.7, reference .ring-av):
// бумажная дуга вокруг аватара растёт по мере свайпа.
export const ProgressRings = ({ participants, done, total }: Props) => (
  <div className="flex flex-none items-center">
    {participants.map((person, index) => {
      const progress =
        total > 0 ? Math.min(1, (done[person.id] ?? 0) / total) : 0;
      return (
        <span
          key={person.id}
          role="img"
          aria-label={`${person.name}: ${done[person.id] ?? 0} из ${total}`}
          className={
            index > 0
              ? "bg-velvet relative -ml-2.5 grid size-[46px] place-items-center rounded-full"
              : "bg-velvet relative grid size-[46px] place-items-center rounded-full"
          }
        >
          <svg
            viewBox="0 0 46 46"
            aria-hidden
            className="absolute inset-0 size-[46px] -rotate-90"
          >
            <circle
              cx="23"
              cy="23"
              r="21.5"
              fill="none"
              strokeWidth={2.4}
              className="stroke-line"
            />
            <circle
              cx="23"
              cy="23"
              r="21.5"
              fill="none"
              strokeWidth={2.4}
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - progress}
              strokeLinecap="round"
              className="stroke-paper ease-out-soft transition-[stroke-dashoffset] duration-[420ms]"
            />
          </svg>
          <Avatar
            name={person.name}
            color={person.avatarColor}
            size={36}
            decorative
          />
        </span>
      );
    })}
  </div>
);
