"use client";

import { type KeyboardEvent, type PointerEvent, useRef, useState } from "react";

import { formatBudget, formatNumber } from "@/shared/lib/format-price";
import { cn } from "@/shared/lib/utils";

import {
  BUDGET_MAX,
  MAGNETS,
  STOPS,
  nextStop,
  snapPosition,
  toPosition,
} from "./scale";

// max = null — «без верхней границы» (ProductFilters.budget, TECH_SPEC §5).
export type BudgetRange = { max: null | number; min: number };

type Props = {
  className?: string;
  label: string;
  onChange: (value: BudgetRange) => void;
  // Значение по окончании жеста — чтобы не дёргать счётчик на каждый шаг.
  onChangeEnd?: (value: BudgetRange) => void;
  value: BudgetRange;
};

type Thumb = "max" | "min";

// Минимальный зазор между ползунками — по месту на шкале.
const MIN_GAP = 0.04;

const toRange = (min: number, max: number): BudgetRange => ({
  min,
  max: max >= BUDGET_MAX ? null : max,
});

// RangeSlider (DESIGN.md §7): два ползунка на логарифмической шкале с
// «магнитами», над треком живое значение «до 5 000 сом». Ползунки 28px, зона
// нажатия 44px, стрелки клавиатуры переходят к соседнему круглому значению.
// Свой, а не из imbir: там два <input type=range> на линейной шкале — ни лога,
// ни магнитов на них не сделать.
export const RangeSlider = ({
  label,
  value,
  onChange,
  onChangeEnd,
  className,
}: Props) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState<null | Thumb>(null);
  // Последнее значение жеста: проп value к pointerup может ещё не обновиться.
  const lastRef = useRef(value);
  const minValue = value.min;
  const maxValue = value.max ?? BUDGET_MAX;
  const minPos = toPosition(minValue);
  const maxPos = toPosition(maxValue);

  const positionAt = (clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return 0;
    return (clientX - rect.left) / rect.width;
  };

  const update = (thumb: Thumb, position: number): BudgetRange => {
    if (thumb === "min") {
      const capped = Math.min(position, maxPos - MIN_GAP);
      const next = Math.min(snapPosition(capped), maxValue);
      return toRange(
        next >= maxValue ? nextStop(maxValue, -1) : next,
        maxValue,
      );
    }
    const capped = Math.max(position, minPos + MIN_GAP);
    const next = Math.max(snapPosition(capped), minValue);
    return toRange(minValue, next <= minValue ? nextStop(minValue, 1) : next);
  };

  const handlePointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button > 0) return;
    const position = positionAt(event.clientX);
    // Берём ближайший ползунок; если стоят вплотную — по направлению.
    const thumb: Thumb =
      Math.abs(position - minPos) < Math.abs(position - maxPos) ||
      (minPos === maxPos && position < minPos)
        ? "min"
        : "max";
    event.currentTarget.setPointerCapture(event.pointerId);
    setDragging(thumb);
    lastRef.current = update(thumb, position);
    onChange(lastRef.current);
  };

  const handlePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    lastRef.current = update(dragging, positionAt(event.clientX));
    onChange(lastRef.current);
  };

  const handlePointerUp = () => {
    if (!dragging) return;
    setDragging(null);
    onChangeEnd?.(lastRef.current);
  };

  const handleKeyDown = (thumb: Thumb) => (event: KeyboardEvent) => {
    const currentValue = thumb === "min" ? minValue : maxValue;
    let next: null | number = null;
    if (event.key === "ArrowRight" || event.key === "ArrowUp") {
      next = nextStop(currentValue, 1);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowDown") {
      next = nextStop(currentValue, -1);
    } else if (event.key === "Home") {
      next = thumb === "min" ? 0 : nextStop(minValue, 1);
    } else if (event.key === "End") {
      next = thumb === "min" ? nextStop(maxValue, -1) : BUDGET_MAX;
    }
    if (next === null) return;
    event.preventDefault();
    const range =
      thumb === "min"
        ? toRange(Math.min(next, nextStop(maxValue, -1)), maxValue)
        : toRange(minValue, Math.max(next, nextStop(minValue, 1)));
    onChange(range);
    onChangeEnd?.(range);
  };

  const thumbClass =
    "absolute top-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full touch-none after:size-7 after:rounded-full after:bg-paper after:shadow-[0_4px_10px_rgb(10_0_8/0.45)] after:transition-transform after:duration-[120ms] after:content-['']";

  return (
    <div className={cn("flex flex-col", className)}>
      <div className="mb-1 flex items-baseline justify-between gap-3">
        <span className="text-label">{label}</span>
        <span className="text-label text-paper tabular-nums">
          {formatBudget(value.min, value.max)}
        </span>
      </div>

      <div
        className="relative h-11 cursor-pointer touch-none"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        <div
          ref={trackRef}
          className="bg-velvet-3 absolute inset-x-3.5 top-1/2 h-1.5 -translate-y-1/2 rounded-[3px]"
        >
          {MAGNETS.map((magnet) => (
            <span
              key={magnet}
              aria-hidden
              style={{ left: `${toPosition(magnet) * 100}%` }}
              className="absolute top-1/2 size-[3px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[rgb(255_241_243/0.35)]"
            />
          ))}
          <div
            className="bg-mandarin absolute inset-y-0 rounded-[3px]"
            style={{
              left: `${minPos * 100}%`,
              width: `${(maxPos - minPos) * 100}%`,
            }}
          />
          {(["min", "max"] as const).map((thumb) => {
            const thumbValue = thumb === "min" ? minValue : maxValue;
            const valueText =
              thumb === "max" && value.max === null
                ? "без ограничения"
                : `${formatNumber(thumbValue)} сом`;
            return (
              <div
                key={thumb}
                role="slider"
                tabIndex={0}
                aria-label={thumb === "min" ? "Бюджет от" : "Бюджет до"}
                aria-valuemin={STOPS[0]}
                aria-valuemax={BUDGET_MAX}
                aria-valuenow={thumbValue}
                aria-valuetext={valueText}
                onKeyDown={handleKeyDown(thumb)}
                style={{ left: `${toPosition(thumbValue) * 100}%` }}
                className={cn(
                  thumbClass,
                  dragging === thumb && "after:scale-110",
                  thumb === "max" ? "z-20" : "z-10",
                )}
              />
            );
          })}
        </div>
      </div>

      <div className="text-caption text-rose flex justify-between px-0.5">
        <span>0 сом</span>
        <span>{formatNumber(BUDGET_MAX)}+ сом</span>
      </div>
    </div>
  );
};
