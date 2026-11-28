"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell, CalendarPlus } from "lucide-react";

import { remindText } from "@/widgets/activity-deck";

import {
  type PlanView,
  countedParticipants,
  formatDeadline,
} from "@/entities/plan";

import { extendPlan, isApiError, planKeys } from "@/shared/api";
import { copyText, inviteUrl, usePrefetchInvite } from "@/shared/lib/dom";
import { Button, EmptyState, toast } from "@/shared/ui";

import { laggingOf, timedOutTitle } from "../model";

type Props = { meId: string; view: PlanView };

// Итоги «До даты», когда дата пришла, а долистал меньше двоих (auto-tasks-
// ux-5 Y02): не «Совпадений нет», а «время вышло». Организатор продлевает
// план на сутки или напоминает отстающим — «Напомнить» тоже продлевает:
// по ссылке в закрытый план уже не долистать.
export const TimedOut = ({ view, meId }: Props) => {
  const queryClient = useQueryClient();
  const { plan, participants, activities } = view;
  const isOwner = plan.ownerId === meId;
  const counted = new Set(countedParticipants(plan));
  const finished = participants.filter((person) => counted.has(person.id));
  // Как в колоде: прогресс — по занятиям, которые есть в каталоге.
  const lagging = laggingOf(
    participants,
    plan.swipes,
    activities.map((activity) => activity.id),
    meId,
  );

  // Переменная мутации — нажали «Напомнить» (true) или «Продлить» (false).
  const extend = useMutation<PlanView, Error, boolean>({
    mutationFn: () => extendPlan(plan.id),
    onSuccess: (next, reminded) => {
      queryClient.setQueryData(planKeys.detail(plan.id), next);
      void queryClient.invalidateQueries({ queryKey: planKeys.list() });
      const until = next.plan.deadline
        ? formatDeadline(next.plan.deadline).replace(/^До /, "до ")
        : "на сутки";
      toast(
        reminded
          ? `Текст со ссылкой скопирован, план продлён ${until}`
          : `План продлён ${until}`,
        { tone: "success" },
      );
    },
    onError: (error) =>
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось продлить. Попробуй ещё раз",
        { tone: "error" },
      ),
  });

  // Ссылка — заранее: Safari пускает в буфер только сразу после нажатия.
  usePrefetchInvite("plan", plan.id, isOwner);
  const remind = async () => {
    const url = await inviteUrl("plan", plan.id).catch(() => null);
    if (!url) {
      toast("Не получилось собрать ссылку", { tone: "error" });
      return;
    }
    const ok = await copyText(`${remindText(lagging, plan.title)} ${url}`);
    if (!ok) {
      toast("Не получилось скопировать", { tone: "error" });
      return;
    }
    extend.mutate(true);
  };

  return (
    <div className="flex flex-col gap-6 pb-4">
      <h2 className="text-title-1">{plan.title}</h2>
      <EmptyState
        object="ticket"
        title={timedOutTitle(isOwner, meId, finished)}
        action={
          isOwner ? (
            <div className="flex flex-col gap-2">
              <Button
                icon={<CalendarPlus aria-hidden size={18} strokeWidth={2} />}
                loading={extend.isPending && extend.variables === false}
                disabled={extend.isPending}
                onClick={() => extend.mutate(false)}
              >
                Продлить на сутки
              </Button>
              {lagging.length > 0 && (
                <Button
                  variant="secondary"
                  icon={<Bell aria-hidden size={18} strokeWidth={2} />}
                  loading={extend.isPending && extend.variables === true}
                  disabled={extend.isPending}
                  onClick={() => void remind()}
                >
                  Напомнить
                </Button>
              )}
            </div>
          ) : undefined
        }
      />
    </div>
  );
};
