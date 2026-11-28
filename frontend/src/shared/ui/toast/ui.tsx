"use client";

import { Check, CircleAlert, Info } from "lucide-react";
import {
  AnimatePresence,
  type PanInfo,
  motion,
  useReducedMotion,
} from "motion/react";

import { splitErrorCode } from "@/shared/api/error-code";
import { cn } from "@/shared/lib/utils";

import { ErrorCode } from "../error-code";
import { OverlayPortal } from "../portal";
import { Spinner } from "../spinner";
import { type ToastTone, toast, useCurrentToast } from "./model";

const ICONS: Record<ToastTone, React.ReactNode> = {
  success: <Check aria-hidden size={18} strokeWidth={2} />,
  info: <Info aria-hidden size={18} strokeWidth={1.75} />,
  error: <CircleAlert aria-hidden size={18} strokeWidth={1.75} />,
  loading: <Spinner className="size-[18px]" />,
};

// Свайп вверх на 24px закрывает тост (DESIGN.md §7 Toast).
const DISMISS_OFFSET = -24;

// Бумажная плашка сверху, под шапкой: иконка + одна строка. Контейнер с
// aria-live всегда в DOM — иначе скринридер не озвучит первый тост.
export const Toaster = () => {
  const item = useCurrentToast();
  const reduceMotion = useReducedMotion();
  // «… · код a1b2c3d4» (S08): фраза — как есть, код — мелкой кнопкой.
  const { text, code } = splitErrorCode(item?.text ?? "");

  const handleDragEnd = (_: unknown, info: PanInfo) => {
    if (item && (info.offset.y < DISMISS_OFFSET || info.velocity.y < -400)) {
      toast.dismiss(item.id);
    }
  };

  return (
    <OverlayPortal>
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+62px)] z-[180] flex justify-center px-5"
        style={
          item?.below
            ? { top: `calc(env(safe-area-inset-top) + ${62 + item.below}px)` }
            : undefined
        }
      >
        <AnimatePresence>
          {item && (
            <motion.div
              key={item.id}
              className={cn(
                "paper rounded-field shadow-paper pointer-events-auto flex max-w-full touch-none items-center gap-2 py-[11px] pr-4 pl-4 text-[14px] leading-5 font-medium",
                // Две кнопки на 360 px рядом с текстом не помещаются — они
                // уходят второй строкой вправо, текст остаётся целым.
                item.secondAction && "flex-wrap gap-y-2",
              )}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { duration: 0.2, ease: [0.16, 1, 0.3, 1] }
              }
              drag="y"
              dragConstraints={{ top: 0, bottom: 0 }}
              dragElastic={{ top: 0.6, bottom: 0 }}
              dragSnapToOrigin
              onDragEnd={handleDragEnd}
            >
              <span className="text-mandarin-ink flex-none">
                {ICONS[item.tone]}
              </span>
              {/* До трёх строк: тост вкуса с двумя интересами и кнопкой
                  «Поправить» не должен обрываться многоточием (UX-аудит M2). */}
              <span className="line-clamp-3 min-w-0">
                {text}
                {code && (
                  <>
                    {" "}
                    <ErrorCode code={code} />
                  </>
                )}
              </span>
              {item.action && (
                <span
                  className={cn(
                    "flex flex-none items-center gap-2",
                    item.secondAction && "ml-auto",
                  )}
                >
                  {[item.action, item.secondAction].map(
                    (action) =>
                      action && (
                        <button
                          key={action.label}
                          type="button"
                          onClick={() => {
                            action.onClick();
                            toast.dismiss(item.id);
                          }}
                          className="text-mandarin-ink relative -my-2 ml-1 flex-none px-2 py-2 font-semibold before:absolute before:-inset-1 before:content-['']"
                        >
                          {action.label}
                        </button>
                      ),
                  )}
                </span>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </OverlayPortal>
  );
};
