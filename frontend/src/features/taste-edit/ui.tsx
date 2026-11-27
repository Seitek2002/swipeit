"use client";

import { type ComponentProps, useId, useState } from "react";

import { ChevronDown, Sparkles, X } from "lucide-react";

import { INTEREST_LABELS, type InterestId } from "@/shared/config";
import { cn } from "@/shared/lib/utils";
import { Chip } from "@/shared/ui";

import { useTasteEdit } from "./api";
import { tasteGroups } from "./model";

type Props = {
  className?: string;
  // Якорь раздела: тост «Подстроили ленту…» ведёт сюда кнопкой «Поправить».
  id?: string;
};

// «Мне нравится» в профиле (DESIGN.md §8.9, quick-start.html кадр 7).
// Интересы не спрашиваем — выводим из «Хочу», а здесь человек видит, что мы
// поняли, и поправляет: подтверждает догадку, отвечает «Не моё» или выбирает
// сам из всех 20.
export const TasteEdit = ({ id, className }: Props) => {
  const { state, hasLikes, apply } = useTasteEdit();
  const [expanded, setExpanded] = useState(false);
  const headingId = useId();
  const restId = useId();

  if (!state) return null;
  const { own, inferred, rest } = tasteGroups(state);

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      // Шапка экрана не плавает над телом, но без отступа заголовок раздела
      // прилипнет к самому краю прокрутки.
      className={cn("flex scroll-mt-4 flex-col", className)}
    >
      <h2 id={headingId} className="text-label text-paper mb-3">
        Мне нравится
      </h2>

      {own.length > 0 && (
        <ChipWrap role="group" aria-label="Мои интересы">
          {own.map((interest) => (
            <Chip
              key={interest}
              selected
              onClick={() => apply({ type: "remove", id: interest })}
            >
              {INTEREST_LABELS[interest]}
            </Chip>
          ))}
        </ChipWrap>
      )}

      {inferred.length > 0 && (
        <>
          <p
            className={cn(
              "text-caption text-rose mb-2.5",
              own.length > 0 && "mt-4",
            )}
          >
            Похоже, тебе нравится — по твоим «Хочу»
          </p>
          <ChipWrap role="group" aria-label="Похоже, тебе нравится">
            {inferred.map((interest) => (
              <GuessChip
                key={interest}
                interest={interest}
                onConfirm={() => apply({ type: "add", id: interest })}
                onMute={() => apply({ type: "mute", id: interest })}
              />
            ))}
          </ChipWrap>
        </>
      )}

      {!hasLikes && (
        <p className={cn("text-caption text-rose", own.length > 0 && "mt-3")}>
          Свайпни пару подарков — подстроимся сами
        </p>
      )}

      {/* Лайки есть, а чипов ещё нет: интерес выводится, когда набрал вес 2
          (DESIGN.md §8.9, TECH_SPEC §6 «Вкус»). */}
      {hasLikes && own.length === 0 && inferred.length === 0 && (
        <p className="text-caption text-rose">
          Ещё несколько «Хочу» — и подскажем, что тебе нравится
        </p>
      )}

      {expanded && rest.length > 0 && (
        <ChipWrap
          id={restId}
          role="group"
          aria-label="Все интересы"
          className="mt-4"
        >
          {rest.map((interest) => (
            <Chip
              key={interest}
              selected={false}
              onClick={() => apply({ type: "add", id: interest })}
            >
              {INTEREST_LABELS[interest]}
            </Chip>
          ))}
        </ChipWrap>
      )}

      {rest.length > 0 && (
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={expanded ? restId : undefined}
          onClick={() => setExpanded((value) => !value)}
          className="text-label text-rose mt-1.5 inline-flex min-h-11 items-center gap-1.5 self-start"
        >
          Все интересы
          <ChevronDown
            aria-hidden
            size={18}
            strokeWidth={1.75}
            className={cn(
              "ease-out-soft transition-transform duration-200 motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
          />
        </button>
      )}
    </section>
  );
};

const ChipWrap = ({ className, ...props }: ComponentProps<"div">) => (
  <div className={cn("flex flex-wrap gap-2", className)} {...props} />
);

type GuessChipProps = {
  interest: InterestId;
  onConfirm: () => void;
  onMute: () => void;
};

// Догадка по лайкам: бархат-3 с Sparkles, внутри — отдельная кнопка X
// («Не моё»). Две цели в одном чипе, поэтому у каждой своя зона ≥ 44 px:
// по высоте — псевдоэлементом, у X ещё и по ширине (40 px + 4 px справа).
const GuessChip = ({ interest, onConfirm, onMute }: GuessChipProps) => {
  const label = INTEREST_LABELS[interest];
  return (
    <span className="rounded-chip bg-velvet-3 text-paper inline-flex h-9 flex-none items-center text-[14px] leading-none font-medium">
      <button
        type="button"
        onClick={onConfirm}
        aria-label={`Мне нравится: ${label}`}
        className="relative inline-flex h-9 items-center gap-1.5 rounded-l-full pr-1 pl-3 whitespace-nowrap before:absolute before:inset-x-0 before:-inset-y-1 before:content-['']"
      >
        <Sparkles
          aria-hidden
          size={16}
          strokeWidth={1.75}
          className="text-rose"
        />
        {label}
      </button>
      <button
        type="button"
        onClick={onMute}
        aria-label={`Не моё: ${label}`}
        className="text-rose relative grid h-9 w-10 place-items-center rounded-r-full before:absolute before:-inset-y-1 before:right-[-4px] before:left-0 before:content-['']"
      >
        <X aria-hidden size={16} strokeWidth={1.75} />
      </button>
    </span>
  );
};
