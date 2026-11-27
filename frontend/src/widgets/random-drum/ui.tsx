"use client";

import { useEffect, useRef, useState } from "react";

import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
} from "motion/react";

import type { Activity } from "@/entities/activity";

import { withBasePath } from "@/shared/lib/base-path";
import { vibrate } from "@/shared/lib/dom";

type Props = {
  // Итог известен заранее — сервер выбрал его до анимации (TECH_SPEC §6).
  activityId: string;
  onDone: () => void;
  // Среди чего крутим: совпадения, а если их нет — «почти».
  pool: Activity[];
};

const ROW = 88;
const VISIBLE = 3;
// Сколько полных оборотов пройдёт лента до итога.
const LAPS = 4;

const Row = ({ activity }: { activity: Activity }) => (
  <div
    className="paper rounded-field mx-auto flex items-center gap-3 px-2.5"
    style={{ height: ROW - 10, width: "100%" }}
  >
    <div className="bg-paper-2 size-[60px] flex-none overflow-hidden rounded-[12px]">
      {activity.image && (
        <img
          src={withBasePath(activity.image.src)}
          alt=""
          className="size-full object-cover"
        />
      )}
    </div>
    <p className="text-title-3 line-clamp-2 min-w-0 flex-1 text-left">
      {activity.title}
    </p>
  </div>
);

// Рандом-барабан (DESIGN.md §6, вау-момент 3): билетики совпадений крутятся
// вертикальной лентой, как ячейка игрового автомата, — разгон, замедление
// пружиной и остановка с лёгким перелётом на заранее выбранном занятии.
export const RandomDrum = ({ pool, activityId, onDone }: Props) => {
  const reduceMotion = useReducedMotion();
  const y = useMotionValue(0);
  const doneRef = useRef(onDone);
  const [stopped, setStopped] = useState(false);
  // Без анимации (reduced motion, один вариант) лента сразу стоит на итоге.
  const instant = Boolean(reduceMotion) || pool.length <= 1;
  const settled = instant || stopped;

  useEffect(() => {
    doneRef.current = onDone;
  });

  const target = Math.max(
    0,
    pool.findIndex((activity) => activity.id === activityId),
  );
  // Лента: несколько кругов пула и итог в конце, по центру окна.
  const strip = Array.from({ length: LAPS }, () => pool).flat();
  const stopIndex = strip.length + target;
  const reel = [...strip, ...pool, ...pool];

  useEffect(() => {
    const end = -(stopIndex - 1) * ROW;
    if (instant) {
      y.set(end);
      const timer = setTimeout(() => doneRef.current(), 600);
      return () => clearTimeout(timer);
    }
    // Разгон 300 мс, затем замедление ~2.1 с с перелётом (кривая с y > 1).
    const controls = animate(y, [0, -ROW * 2, end], {
      duration: 2.4,
      times: [0, 0.125, 1],
      ease: [
        [0.5, 0, 1, 1],
        [0.15, 0.85, 0.3, 1.04],
      ],
    });
    void controls.then(() => {
      vibrate(20);
      setStopped(true);
      setTimeout(() => doneRef.current(), 700);
    });
    return () => controls.stop();
  }, [y, stopIndex, instant]);

  return (
    <div className="flex flex-col items-center gap-5 py-6">
      <p className="text-title-2 text-rose">Крутим…</p>
      <div
        role="img"
        aria-label={
          settled ? `Выпало: ${pool[target]?.title ?? ""}` : "Барабан крутится"
        }
        className="border-line relative w-full max-w-[320px] overflow-hidden rounded-[22px] border"
        style={{ height: ROW * VISIBLE }}
      >
        <motion.div style={{ y }} className="flex flex-col px-3 pt-[5px]">
          {reel.map((activity, index) => (
            <div key={`${activity.id}-${index}`} style={{ height: ROW }}>
              <Row activity={activity} />
            </div>
          ))}
        </motion.div>
        {/* Затемнение сверху и снизу, рамка выигрышной ячейки по центру. */}
        <div
          className="from-velvet pointer-events-none absolute inset-x-0 top-0 bg-linear-to-b to-transparent"
          style={{ height: ROW }}
        />
        <div
          className="from-velvet pointer-events-none absolute inset-x-0 bottom-0 bg-linear-to-t to-transparent"
          style={{ height: ROW }}
        />
        <div
          className="border-mandarin pointer-events-none absolute inset-x-1.5 rounded-[18px] border-2"
          style={{ top: ROW, height: ROW }}
        />
      </div>
    </div>
  );
};
