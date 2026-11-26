"use client";

import { useEffect, useRef, useState } from "react";

import { formatRemaining, remainingVerb } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";

type Props = {
  className?: string;
  // Источник времени. В приложении — clock.now() (с перемоткой демо, T04).
  now?: () => number;
  onDone?: () => void;
  to: Date | number | string;
};

// Countdown (DESIGN.md §7): «Осталось 2 дня 4 часа», при < 1 часа — минуты и
// секунды с tabular-nums. Интервал создаётся один раз и не пересоздаётся
// каждый тик (в imbir это было — анти-паттерн A7).
export const Countdown = ({ to, now = Date.now, onDone, className }: Props) => {
  const target = new Date(to).getTime();
  const nowRef = useRef(now);
  const doneRef = useRef(onDone);
  const [current, setCurrent] = useState(() => now());

  useEffect(() => {
    nowRef.current = now;
    doneRef.current = onDone;
  });

  useEffect(() => {
    const timer = setInterval(() => setCurrent(nowRef.current()), 1000);
    return () => clearInterval(timer);
  }, []);

  const remaining = target - current;
  const isOver = remaining <= 0;

  useEffect(() => {
    if (isOver) doneRef.current?.();
  }, [isOver]);

  return (
    <span className={cn("text-label tabular-nums", className)}>
      {isOver
        ? "Время вышло"
        : `${remainingVerb(remaining)} ${formatRemaining(remaining)}`}
    </span>
  );
};
