"use client";

import { motion, useReducedMotion } from "motion/react";

import { cn } from "@/shared/lib/utils";

export const RIBBON_SEGMENTS = 5;

type Props = {
  // На 5-м «Хочу» лента затягивается в бант (DESIGN.md §6, вау-момент 1).
  drawingBow: boolean;
  likes: number;
  onBowDone: () => void;
};

const EASE = [0.16, 1, 0.3, 1] as const;

const BOW_PATHS = [
  { d: "M32 20C24 5 5 2 5 14s19 11 27 6z", filled: true },
  { d: "M32 20c8-15 27-18 27-6s-19 11-27 6z", filled: true },
  { d: "M30 23c-4 8-8 13-14 19", filled: false },
  { d: "M34 23c4 8 8 13 14 19", filled: false },
];

// Лента прогресса до открытия шеринга (DESIGN.md §7 WishRibbon): 5 сегментов,
// заполненный — мандарин. Подпись короткая — полная фраза на 360px не влезает.
export const WishRibbon = ({ likes, drawingBow, onBowDone }: Props) => {
  const reduceMotion = useReducedMotion();
  const filled = Math.min(likes, RIBBON_SEGMENTS);
  const left = RIBBON_SEGMENTS - filled;

  return (
    <div className="relative flex h-[30px] flex-none items-center gap-2.5 px-5">
      <div
        role="progressbar"
        aria-label="До отправки вишлиста"
        aria-valuemin={0}
        aria-valuemax={RIBBON_SEGMENTS}
        aria-valuenow={filled}
        className={cn(
          "flex w-20 flex-none gap-1",
          drawingBow && "opacity-0 transition-opacity duration-300",
        )}
      >
        {Array.from({ length: RIBBON_SEGMENTS }, (_, index) => (
          <i
            key={index}
            className="bg-velvet-3 relative h-1.5 flex-1 overflow-hidden rounded-[3px]"
          >
            <span
              className={cn(
                "bg-mandarin ease-out-soft absolute inset-0 origin-left transition-transform duration-[320ms]",
                index < filled ? "scale-x-100" : "scale-x-0",
              )}
            />
          </i>
        ))}
      </div>
      <p
        className={cn(
          "text-caption text-rose truncate",
          drawingBow && "opacity-0",
        )}
      >
        {left > 0 ? `Ещё ${left} — и можно отправить` : "Вишлист готов"}
      </p>

      {drawingBow && (
        <div className="pointer-events-none absolute inset-x-0 -inset-y-[18px] grid place-items-center">
          <motion.svg
            viewBox="0 0 64 44"
            aria-hidden
            className="h-11 w-16 overflow-visible"
            style={{ originX: 0.5, originY: 0.4 }}
            animate={reduceMotion ? undefined : { rotate: [0, -5, 5, 0] }}
            transition={{ delay: 0.64, duration: 0.7, ease: "easeInOut" }}
            onAnimationComplete={onBowDone}
          >
            {BOW_PATHS.map((path) => (
              <motion.path
                key={path.d}
                d={path.d}
                className={cn(
                  "stroke-mandarin",
                  path.filled ? "fill-mandarin" : "fill-none",
                )}
                strokeWidth={path.filled ? 2.4 : 4}
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={
                  reduceMotion ? false : { pathLength: 0, fillOpacity: 0 }
                }
                animate={{ pathLength: 1, fillOpacity: 1 }}
                transition={{
                  pathLength: { duration: 0.6, ease: EASE },
                  fillOpacity: { duration: 0.26, delay: 0.42 },
                }}
              />
            ))}
            <motion.circle
              cx="32"
              cy="20"
              r="5"
              className="fill-mandarin"
              initial={reduceMotion ? false : { scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.42, duration: 0.26 }}
            />
          </motion.svg>
        </div>
      )}
    </div>
  );
};
