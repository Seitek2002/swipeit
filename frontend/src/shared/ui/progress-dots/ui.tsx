import { cn } from "@/shared/lib/utils";

type Props = {
  className?: string;
  count: number;
  // Номер текущего шага с нуля.
  current: number;
  // Имя для скринридера — что за шаги («Шаги создания плана»).
  label?: string;
};

// Прогресс-точки потока из нескольких шагов (создание плана, DESIGN.md §8.7).
// Текущий шаг — вытянутая бумажная таблетка, пройденные — бумага, впереди —
// бархат-3. Мандарин не тратим: на экране он у главной кнопки.
export const ProgressDots = ({
  count,
  current,
  className,
  label = "Шаги",
}: Props) => (
  <div
    role="progressbar"
    aria-label={label}
    aria-valuemin={1}
    aria-valuemax={count}
    aria-valuenow={current + 1}
    aria-valuetext={`Шаг ${current + 1} из ${count}`}
    className={cn("flex items-center gap-1.5", className)}
  >
    {Array.from({ length: count }, (_, index) => (
      <span
        key={index}
        className={cn(
          "ease-out-soft h-1.5 rounded-full transition-[width,background-color] duration-200",
          index === current ? "bg-paper w-5" : "w-1.5",
          index < current && "bg-paper",
          index > current && "bg-velvet-3",
        )}
      />
    ))}
  </div>
);
