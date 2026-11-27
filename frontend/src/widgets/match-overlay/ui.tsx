"use client";

import { useEffect, useState } from "react";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { ActivityTicket } from "@/entities/activity";
import type { PlanView } from "@/entities/plan";

import { vibrate } from "@/shared/lib/dom";
import { getRealtime } from "@/shared/lib/realtime";
import { Avatar, OverlayPortal } from "@/shared/ui";

// Оверлей держится 3.2 с — за 1.6 не успевают прочитать (DESIGN.md §6).
const HOLD_MS = 3200;
const EASE = [0.16, 1, 0.3, 1] as const;

// Аватары веером по бокам билетика (reference .m-av).
const FAN = [
  { x: -138, y: -54, rotate: -10 },
  { x: 138, y: -54, rotate: 10 },
  { x: -150, y: 30, rotate: -4 },
  { x: 150, y: 30, rotate: 4 },
];

type Props = { view: PlanView };

// «Совпадение» (DESIGN.md §6, вау-момент 2): билетик совпавшего занятия
// выезжает по центру, по бокам веером аватары тех, кто «за», мятное свечение.
// Закрывается тапом или сам через 3.2 с. Слушает шину сам — как и задумано
// для оверлея (TECH_SPEC §7): событие plan:match приходит всем участникам.
export const MatchOverlay = ({ view }: Props) => {
  const reduceMotion = useReducedMotion();
  const [queue, setQueue] = useState<string[]>([]);
  const planId = view.plan.id;

  useEffect(
    () =>
      getRealtime().subscribe((event) => {
        if (event.type !== "plan:match" || event.planId !== planId) return;
        setQueue((current) =>
          current.includes(event.activityId)
            ? current
            : [...current, event.activityId],
        );
      }),
    [planId],
  );

  const currentId = queue[0];
  useEffect(() => {
    if (!currentId) return;
    vibrate(15);
    const timer = setTimeout(
      () => setQueue((current) => current.slice(1)),
      HOLD_MS,
    );
    return () => clearTimeout(timer);
  }, [currentId]);

  const activity = view.activities.find((item) => item.id === currentId);
  const fans = view.participants.filter(
    (person) => view.plan.swipes[person.id]?.[currentId ?? ""] === "like",
  );
  const everyone = fans.length === view.participants.length;
  const close = () => setQueue((current) => current.slice(1));

  return (
    <OverlayPortal>
      <AnimatePresence>
        {activity && (
          <motion.div
            key={activity.id}
            role="dialog"
            aria-modal="true"
            aria-label={`Совпадение: ${activity.title}`}
            onClick={close}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0 : 0.3 }}
            className="absolute inset-0 z-[100] flex cursor-pointer flex-col items-center justify-center bg-[rgb(10_0_8/0.62)] px-5 text-center backdrop-blur-[6px]"
          >
            <motion.div
              aria-hidden
              initial={{ scale: 0.6 }}
              animate={{ scale: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.9, ease: EASE }}
              className="pointer-events-none absolute top-[52%] left-1/2 -mt-[210px] -ml-[210px] size-[420px] rounded-full bg-[radial-gradient(circle,rgb(143_227_198/0.42),rgb(143_227_198/0)_62%)]"
            />
            <motion.p
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{
                duration: reduceMotion ? 0 : 0.5,
                delay: 0.12,
                ease: EASE,
              }}
              className="text-display relative"
            >
              Совпадение!
            </motion.p>
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: reduceMotion ? 0 : 0.4, delay: 0.22 }}
              className="text-body text-paper relative mt-2 max-w-[28ch]"
            >
              {everyone ? "Все хотят" : "Большинство за"}: {activity.title}
            </motion.p>
            <div className="relative mt-[18px] flex w-full justify-center">
              <motion.div
                initial={
                  reduceMotion
                    ? { opacity: 0 }
                    : { y: 80, scale: 0.85, opacity: 0 }
                }
                animate={{ y: 0, scale: 1, opacity: 1 }}
                transition={{
                  duration: reduceMotion ? 0 : 0.6,
                  delay: 0.08,
                  ease: EASE,
                }}
                className="relative w-[220px] text-left drop-shadow-[0_20px_26px_rgb(10_0_8/0.5)]"
              >
                <ActivityTicket activity={activity} />
              </motion.div>
              {fans.slice(0, FAN.length).map((person, index) => {
                const spot = FAN[index] ?? { x: 0, y: 0, rotate: 0 };
                return (
                  <motion.span
                    key={person.id}
                    aria-hidden
                    initial={{ x: 0, y: 0, opacity: 0 }}
                    animate={{
                      x: spot.x,
                      y: spot.y,
                      rotate: spot.rotate,
                      opacity: 1,
                    }}
                    transition={{
                      duration: reduceMotion ? 0 : 0.6,
                      delay: 0.26,
                      ease: EASE,
                    }}
                    className="absolute top-1/2 left-1/2 -mt-6 -ml-6 rounded-full shadow-[0_0_0_3px_var(--color-velvet)]"
                  >
                    <Avatar
                      name={person.name}
                      color={person.avatarColor}
                      size={48}
                      decorative
                    />
                  </motion.span>
                );
              })}
            </div>
            <p className="text-caption text-rose relative mt-[18px]">
              Нажми, чтобы листать дальше
            </p>
          </motion.div>
        )}
      </AnimatePresence>
    </OverlayPortal>
  );
};
