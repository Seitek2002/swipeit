"use client";

import { ArrowLeftRight, Plus, X } from "lucide-react";

import { Button, IconButton } from "@/shared/ui";

import type { SantaPair } from "../exclusions";

type Props = {
  addDisabled?: boolean;
  // Пока идёт запрос — крестики и кнопка не жмутся второй раз.
  busy?: boolean;
  // Текст ошибки сервера под секцией (R03): «Слишком много исключений…».
  error?: null | string;
  nameOf: (id: string) => string;
  onAdd: () => void;
  onRemove: (pair: SantaPair) => void;
  pairs: readonly SantaPair[];
};

// Секция «Исключения» (DESIGN.md §8.8): пары «А ⇄ Б» с крестиком и кнопка
// «Эти двое не дарят друг другу». Одна и та же при создании и на экране
// игры (R03).
export const ExclusionList = ({
  pairs,
  nameOf,
  onAdd,
  onRemove,
  addDisabled,
  busy,
  error,
}: Props) => (
  <section className="flex flex-col gap-2.5">
    <h2 className="text-label">Исключения</h2>
    {pairs.map((pair) => (
      <div
        key={pair.join(":")}
        className="bg-velvet-2 border-line rounded-field flex min-h-12 items-center gap-2 border pr-1 pl-3.5"
      >
        <span className="text-body text-paper flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate">{nameOf(pair[0])}</span>
          <ArrowLeftRight
            aria-label="не дарят друг другу"
            size={16}
            strokeWidth={1.75}
            className="text-rose flex-none"
          />
          <span className="truncate">{nameOf(pair[1])}</span>
        </span>
        <IconButton
          label={`Убрать пару ${nameOf(pair[0])} и ${nameOf(pair[1])}`}
          disabled={busy}
          onClick={() => onRemove(pair)}
        >
          <X aria-hidden size={18} strokeWidth={1.75} />
        </IconButton>
      </div>
    ))}
    <Button
      variant="secondary"
      disabled={addDisabled || busy}
      icon={<Plus aria-hidden size={18} strokeWidth={2} />}
      onClick={onAdd}
    >
      Эти двое не дарят друг другу
    </Button>
    {error && (
      <p role="alert" className="text-caption text-pomegranate">
        {error}
      </p>
    )}
  </section>
);
