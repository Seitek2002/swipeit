"use client";

import { useId, useRef } from "react";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";

import { useFocusTrap } from "@/shared/lib/dom";
import { useScrollLock } from "@/shared/lib/dom";
import { cn } from "@/shared/lib/utils";

import { Button } from "../button";
import { OverlayPortal } from "../portal";
import { Spinner } from "../spinner";

type Props = {
  cancelLabel?: string;
  confirmLabel: string;
  description?: string;
  // Пока ждём ответ на onConfirm — вуаль со спиннером, закрыть нельзя
  // (как в imbir: не словить повторный сабмит или закрытие посреди запроса).
  isLoading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
  open: boolean;
  title: string;
  // danger — для удаления и сброса: кнопка гранатовая, а не мандариновая.
  variant?: "danger" | "default";
};

// ConfirmDialog (DESIGN.md §7): компактная бумажная карточка по центру для
// необратимых действий — «Провести жеребьёвку? Поменять пары потом нельзя».
// Перенесён из imbir, плюс role="alertdialog", ловушка и возврат фокуса.
export const ConfirmDialog = (props: Props) => (
  <OverlayPortal>
    <AnimatePresence>{props.open && <DialogCard {...props} />}</AnimatePresence>
  </OverlayPortal>
);

const DialogCard = ({
  title,
  description,
  confirmLabel,
  cancelLabel = "Отмена",
  variant = "default",
  isLoading = false,
  onClose,
  onConfirm,
}: Props) => {
  const titleId = useId();
  const descriptionId = useId();
  const cardRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();

  const handleClose = () => {
    if (!isLoading) onClose();
  };

  useScrollLock(true);
  const handleKeyDown = useFocusTrap(cardRef, true, handleClose);

  const transition = reduceMotion
    ? { duration: 0 }
    : { duration: 0.2, ease: [0.16, 1, 0.3, 1] as const };

  return (
    <motion.div
      className="absolute inset-0 z-[150] grid place-items-center bg-[rgb(10_0_8/0.55)] p-6"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1, transition }}
      exit={{ opacity: 0, transition }}
      onClick={(event) => {
        if (event.target === event.currentTarget) handleClose();
      }}
    >
      <motion.div
        ref={cardRef}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onKeyDown={handleKeyDown}
        className="paper rounded-paper shadow-paper relative w-full max-w-80 px-5 pt-6 pb-4"
        initial={{ scale: 0.96 }}
        animate={{ scale: 1, transition }}
        exit={{ scale: 0.96, transition }}
      >
        <h2 id={titleId} className="text-title-2">
          {title}
        </h2>
        {description && (
          <p id={descriptionId} className="text-body text-ink-soft mt-2">
            {description}
          </p>
        )}
        <div className="mt-5 grid grid-cols-[1fr_1.3fr] gap-2">
          {/* Фокус при открытии — на безопасной «Отмене»: Enter не должен
              запускать необратимое (жеребьёвка, сброс демо). */}
          <Button
            data-autofocus
            variant="ghost"
            className="text-ink-soft"
            onClick={handleClose}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
          <Button
            onClick={onConfirm}
            disabled={isLoading}
            className={cn(
              variant === "danger" && "bg-pomegranate text-ink shadow-none",
            )}
          >
            {confirmLabel}
          </Button>
        </div>
        {isLoading && (
          <div className="rounded-paper bg-paper/70 absolute inset-0 z-10 grid place-items-center">
            <Spinner className="text-ink size-8" />
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};
