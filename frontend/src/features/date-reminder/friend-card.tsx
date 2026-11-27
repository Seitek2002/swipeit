"use client";

import { useId, useState } from "react";

import Link from "next/link";

import { useQueryClient } from "@tanstack/react-query";
import { Cake } from "lucide-react";

import { useFriends, useMe } from "@/entities/user";

import { userKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { clock, useClockOffset } from "@/shared/lib/clock";
import { formatDayMonth, pluralize } from "@/shared/lib/format";
import {
  type FriendBirthdayReminder,
  nearestFriendBirthday,
} from "@/shared/lib/friend-birthday";
import { cn } from "@/shared/lib/utils";
import { Button, buttonClassName, toast } from "@/shared/ui";

import { useDismissReminder } from "./api";
import { reminderWhen } from "./model";

type Props = {
  className?: string;
  // «Предложить выбрать» — шторку ссылки-фильтра открывает экран.
  onPick: (friend: FriendBirthdayReminder) => void;
};

// День рождения друга через 0–14 дней — карточкой на «Вишлисте»
// (auto-tasks P03, PRD §7.2): без уведомлений это повод дарителю вернуться.
// «Скрыть» — до следующего года (id с годом наступления, как у своих
// напоминаний). Внешних отступов нет — их задаёт экран.
export const FriendBirthdayCard = ({ onPick, className }: Props) => {
  const friends = useFriends();
  const { data: me } = useMe();
  const offset = useClockOffset();
  const dismiss = useDismissReminder();
  const queryClient = useQueryClient();
  const textId = useId();
  // Скрытое здесь — сразу, не дожидаясь перечитанного профиля.
  const [hidden, setHidden] = useState<string[]>([]);

  const reminder = nearestFriendBirthday(
    friends.data ?? [],
    [...(me?.dismissedReminders ?? []), ...hidden],
    clock.at(offset),
  );
  if (!reminder) return null;

  const hide = () =>
    dismiss.mutate(reminder.id, {
      onSuccess: () => {
        setHidden((list) => [...list, reminder.id]);
        void queryClient.invalidateQueries({ queryKey: userKeys.me() });
      },
      onError: () =>
        toast("Не получилось скрыть. Попробуй ещё раз", { tone: "error" }),
    });

  return (
    <section
      aria-label="День рождения друга"
      aria-describedby={textId}
      className={cn("paper rounded-paper shadow-paper px-4 py-3.5", className)}
    >
      <div className="flex items-start gap-3">
        <Cake
          aria-hidden
          size={24}
          strokeWidth={1.75}
          className="text-mandarin-ink -mt-px flex-none"
        />
        <div className="min-w-0">
          <p id={textId} className="text-body text-ink">
            {reminderWhen(reminder.daysLeft)} у {reminder.name} день рождения
          </p>
          <p className="text-caption text-ink-soft mt-0.5">
            {formatDayMonth(reminder.date)}
            {reminder.more > 0 && (
              <>
                {" · "}
                <Link href={ROUTES.FRIENDS} className="underline">
                  ещё {pluralize(reminder.more, ["друг", "друга", "друзей"])}
                </Link>
              </>
            )}
          </p>
        </div>
      </div>
      {/* relative z-[1]: кнопки над зерном бумаги (::after у .paper). */}
      <div className="relative z-[1] mt-3 ml-9 flex flex-wrap items-center gap-1">
        <Link
          href={ROUTES.FRIEND_PROFILE(reminder.friendId)}
          // Мандарин на экране один (DESIGN.md §7): под карточкой бывает
          // своя главная кнопка — здесь мандарин-чернила без заливки.
          className={cn(
            buttonClassName({ size: "sm", variant: "ghost" }),
            "text-mandarin-ink",
          )}
        >
          Посмотреть вишлист
        </Link>
        <Button
          size="sm"
          variant="ghost"
          className="text-ink-soft"
          onClick={() => onPick(reminder)}
        >
          Предложить выбрать
        </Button>
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
