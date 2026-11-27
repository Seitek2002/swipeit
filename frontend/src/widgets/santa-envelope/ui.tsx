"use client";

import {
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";

import { useReducedMotion } from "motion/react";

import { vibrate } from "@/shared/lib/dom";
import { cn } from "@/shared/lib/utils";
import { toast } from "@/shared/ui";

export type EnvelopeState = "opened" | "ready" | "sealed";

type Props = {
  // Что написано в письме: «Ты Тайный Санта для» + имя.
  letter: ReactNode;
  onOpen: () => void;
  state: EnvelopeState;
};

const HOLD_MS = 800;
const EASE = "cubic-bezier(0.16, 1, 0.3, 1)";

// Сургуч: две половинки с неровным краем — при вскрытии разлетаются.
const WAX_SHAPE = "47% 53% 51% 49% / 52% 47% 53% 48%";
const WAX_LEFT = "polygon(0 0, 54% 0, 44% 38%, 56% 62%, 46% 100%, 0 100%)";
const WAX_RIGHT =
  "polygon(54% 0, 100% 0, 100% 100%, 46% 100%, 56% 62%, 44% 38%)";

const waxFill = (state: EnvelopeState): CSSProperties =>
  state === "sealed"
    ? {
        background:
          "radial-gradient(circle at 35% 30%, var(--color-velvet-3), var(--color-velvet) 100%)",
        color: "var(--color-rose)",
        boxShadow:
          "inset 0 0 0 5px rgb(255 241 243 / 0.06), 0 4px 10px rgb(10 0 8 / 0.35)",
      }
    : {
        background:
          "radial-gradient(circle at 35% 30%, color-mix(in srgb, var(--color-mandarin) 62%, var(--color-paper)) 0, var(--color-mandarin) 40%, var(--color-mandarin-ink) 100%)",
        color: "var(--color-mandarin-ink)",
        textShadow: "0 1px 0 rgb(255 241 243 / 0.35)",
        boxShadow: "0 4px 10px rgb(10 0 8 / 0.35)",
      };

// Конверт Тайного Санты (DESIGN.md §6, вау-момент 4; §7 SantaEnvelope):
// печать удерживают 0.8 с (кольцо прогресса) — сургуч трескается, клапан
// открывается, письмо с именем подопечного выезжает вверх. Удержание, а не
// тап, — чтобы не открыть случайно. Space или Enter на печати — то же самое.
// Область растёт вместе с письмом: над запечатанным нет пустого места.
export const SantaEnvelope = ({ state, letter, onOpen }: Props) => {
  const reduceMotion = useReducedMotion();
  const [progress, setProgress] = useState(0);
  const frame = useRef<null | number>(null);
  const onOpenRef = useRef(onOpen);

  useEffect(() => {
    onOpenRef.current = onOpen;
  });
  useEffect(
    () => () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    },
    [],
  );

  const opened = state === "opened";
  const move = (ms: number, delay = 0) =>
    reduceMotion ? "none" : `transform ${ms}ms ${EASE} ${delay}ms`;

  const holdStart = () => {
    if (state === "sealed") {
      toast("Письмо откроется после жеребьёвки", { tone: "info" });
      return;
    }
    if (state !== "ready" || frame.current) return;
    const started = performance.now();
    // Время — от performance.now(), а не из аргумента rAF: у метки кадра
    // своя база, и удержание засчиталось бы раньше 0.8 с.
    const step = () => {
      const next = Math.min(1, (performance.now() - started) / HOLD_MS);
      setProgress(next);
      if (next >= 1) {
        frame.current = null;
        setProgress(0);
        vibrate(20);
        onOpenRef.current();
        return;
      }
      frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
  };

  const holdEnd = () => {
    if (!frame.current) return;
    cancelAnimationFrame(frame.current);
    frame.current = null;
    setProgress(0);
  };

  const onKeyDown = (event: KeyboardEvent) => {
    if ((event.key === " " || event.key === "Enter") && !event.repeat) {
      event.preventDefault();
      holdStart();
    }
  };
  const onKeyUp = (event: KeyboardEvent) => {
    if (event.key === " " || event.key === "Enter") holdEnd();
  };

  return (
    <div
      className="relative"
      style={{
        height: opened ? 342 : 238,
        transition: reduceMotion ? "none" : `height 600ms ${EASE}`,
      }}
    >
      <div
        className="absolute bottom-[18px] left-1/2 -ml-[150px] h-[196px] w-[300px]"
        style={{ perspective: 900 }}
      >
        <div className="bg-paper-2 shadow-paper absolute inset-0 rounded-xl" />
        {/* Письмо: при вскрытии выезжает вверх из конверта. */}
        <div
          aria-hidden={!opened}
          className="paper absolute inset-x-3.5 top-3 z-[2] h-[174px] rounded-[10px] px-4 py-[18px] text-center shadow-[0_2px_8px_rgb(10_0_8/0.12)]"
          style={{
            transform: opened ? "translateY(-122px)" : "none",
            transition: move(700, 360),
          }}
        >
          {opened && letter}
        </div>
        <div className="pointer-events-none absolute inset-0 z-[3] rounded-xl drop-shadow-[0_-2px_3px_rgb(10_0_8/0.1)]">
          <div
            className="paper absolute inset-0 rounded-xl"
            style={{
              clipPath: "polygon(0 26%, 50% 64%, 100% 26%, 100% 100%, 0 100%)",
            }}
          />
          <svg
            viewBox="0 0 300 196"
            preserveAspectRatio="none"
            aria-hidden
            className="absolute inset-0 size-full"
          >
            <path
              d="M0 196 150 118M300 196 150 118"
              stroke="rgb(122 90 110 / 0.28)"
              strokeWidth={1.4}
              fill="none"
            />
          </svg>
        </div>
        {/* Клапан: открытый переворачивается и уходит за письмо. */}
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-[64%] drop-shadow-[0_3px_4px_rgb(10_0_8/0.2)]"
          style={{
            zIndex: opened ? 1 : 4,
            transformOrigin: "50% 0",
            transform: opened ? "rotateX(180deg)" : "none",
            transition: reduceMotion
              ? "none"
              : `transform 460ms ${EASE}, z-index 0s 230ms`,
          }}
        >
          <div
            className="absolute inset-0 rounded-t-xl"
            style={{
              clipPath: "polygon(0 0, 100% 0, 50% 100%)",
              background:
                "linear-gradient(to bottom, var(--color-paper), var(--color-paper-2))",
            }}
          />
        </div>
        <button
          type="button"
          aria-label={
            state === "ready"
              ? "Печать: удерживай, чтобы открыть письмо"
              : state === "sealed"
                ? "Печать: письмо откроется после жеребьёвки"
                : "Печать сломана"
          }
          disabled={opened}
          onPointerDown={(event) => {
            try {
              event.currentTarget.setPointerCapture(event.pointerId);
            } catch {
              // Синтетические события без захвата — удержание всё равно идёт.
            }
            holdStart();
          }}
          onPointerUp={holdEnd}
          onPointerCancel={holdEnd}
          onPointerLeave={holdEnd}
          onKeyDown={onKeyDown}
          onKeyUp={onKeyUp}
          onContextMenu={(event) => event.preventDefault()}
          className="absolute top-[64%] left-1/2 z-[5] -mt-14 -ml-[50px] grid size-[100px] touch-none place-items-center rounded-full select-none"
        >
          <svg
            viewBox="0 0 100 100"
            aria-hidden
            className={cn(
              "pointer-events-none absolute inset-0 -rotate-90",
              state !== "ready" && "opacity-0",
            )}
          >
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              strokeWidth={4}
              stroke="rgb(184 70 14 / 0.16)"
            />
            <circle
              cx="50"
              cy="50"
              r="46"
              fill="none"
              strokeWidth={4}
              stroke="var(--color-mandarin-ink)"
              strokeLinecap="round"
              pathLength={1}
              strokeDasharray={1}
              strokeDashoffset={1 - progress}
            />
          </svg>
          <span
            aria-hidden
            className={cn(
              "pointer-events-none absolute top-3.5 left-3.5 size-[72px]",
              state === "ready" && !reduceMotion && "seal-breathe",
            )}
          >
            {(["l", "r"] as const).map((half) => (
              <i
                key={half}
                className="font-display absolute inset-0 grid place-items-center text-[38px] leading-none font-bold italic"
                style={{
                  ...waxFill(state),
                  borderRadius: WAX_SHAPE,
                  clipPath: half === "l" ? WAX_LEFT : WAX_RIGHT,
                  transform: opened
                    ? half === "l"
                      ? "translate(-22px, 26px) rotate(-26deg)"
                      : "translate(22px, 30px) rotate(24deg)"
                    : "none",
                  opacity: opened ? 0 : 1,
                  transition: reduceMotion
                    ? "none"
                    : `transform 420ms ${EASE}, opacity 360ms`,
                }}
              >
                S
              </i>
            ))}
          </span>
        </button>
      </div>
    </div>
  );
};
