"use client";

import { useId } from "react";

import { CalendarHeart } from "lucide-react";

import type { Reminder } from "@/shared/api";
import { cn } from "@/shared/lib/utils";
import { Button, toast } from "@/shared/ui";

import { useDismissReminder } from "./api";
import { reminderText } from "./model";

type Props = {
  className?: string;
  // «Отправить вишлист»: шторка отправки сразу с этим поводом — её
  // открывает экран вишлиста (DESIGN.md §7 ReminderBanner).
  onSend: (reminder: Reminder) => void;
  reminder: Reminder;
  // После отправки вишлист изменился, а ссылка — снимок (демо, UX-аудит G06):
  // друзья по старой ссылке видят прежний — просим отправить новую.
  stale?: boolean;
};

// ReminderBanner (DESIGN.md §7, quick-start.html кадр 6): бумажная плашка
// над «Хочу» за месяц до своей даты. Внешних отступов нет — их задаёт экран.
export const ReminderBanner = ({
  reminder,
  onSend,
  className,
  stale = false,
}: Props) => {
  const dismiss = useDismissReminder();
  const textId = useId();

  const hide = () =>
    dismiss.mutate(reminder.id, {
      // Баннер остаётся на месте — «Скрыть» можно нажать ещё раз.
      onError: () =>
        toast("Не получилось скрыть. Попробуй ещё раз", { tone: "error" }),
    });

  return (
    <section
      aria-label="Напоминание"
      aria-describedby={textId}
      className={cn("paper rounded-paper shadow-paper px-4 py-3.5", className)}
    >
      <div className="flex items-start gap-3">
        <CalendarHeart
          aria-hidden
          size={24}
          strokeWidth={1.75}
          className="text-mandarin-ink -mt-px flex-none"
        />
        <div className="min-w-0">
          <p id={textId} className="text-body text-ink">
            {reminderText(reminder)}
          </p>
          <p className="text-caption text-ink-soft mt-0.5">
            {stale
              ? "После отправки вишлист изменился — по старой ссылке друзья видят прежний. Отправь новую"
              : "Обнови вишлист и отправь друзьям, чтобы они успели выбрать"}
          </p>
        </div>
      </div>
      {/* relative z-[1]: кнопки над зерном бумаги (::after у .paper). */}
      <div className="relative z-[1] mt-3 ml-9 flex items-center gap-1">
        <Button size="sm" onClick={() => onSend(reminder)}>
          {stale ? "Отправить заново" : "Отправить вишлист"}
        </Button>
        {/* Не ghost «Пыльной розой»: на бумаге он не проходит по контрасту. */}
        <Button
          size="sm"
          variant="ghost"
          className="text-ink-soft"
          loading={dismiss.isPending}
          onClick={hide}
        >
          Скрыть
        </Button>
      </div>
    </section>
  );
};
