"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus } from "lucide-react";

import { RandomDrum } from "@/widgets/random-drum";

import {
  LIVE_DURATION_MINUTES,
  buildIcs,
  downloadIcs,
  planWhen,
  suggestedPlanDay,
} from "@/features/calendar-export";

import { ActivityTicket } from "@/entities/activity";
import { type PlanView, decisionCandidates } from "@/entities/plan";

import { cancelPlanDecision, isApiError, planKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { clock } from "@/shared/lib/clock";
import { absoluteUrl } from "@/shared/lib/dom";
import {
  AvatarStack,
  BottomSheet,
  Button,
  ShareActions,
  TextField,
  toast,
} from "@/shared/ui";

// "YYYY-MM-DD" для поля даты — по местному календарю.
const toDateInput = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

type Props = { meId: string; view: PlanView };

// Розыгрыш барабана каждая вкладка видит один раз: и та, что крутила, и
// остальные участники (TASKS T15) — по отметке в sessionStorage.
const seenKey = (planId: string, decidedAt: string) =>
  `swipeit:drum:${planId}:${decidedAt}`;

const wasSeen = (key: string) => {
  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return true;
  }
};

const markSeen = (key: string) => {
  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // Без хранилища покажем ещё раз — не страшно.
  }
};

// «суббота, 28 ноября, 12:00».
const formatWhen = (date: Date) =>
  date.toLocaleString("ru", {
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

// Финал «Решено» (DESIGN.md §8.7): display-заголовок, дата, участники,
// «Отправить в чат», «Добавить в календарь»; у организатора — тихая
// «Отменить решение». «Крутить ещё раз» нет — барабан должен быть честным.
export const Decided = ({ view, meId }: Props) => {
  const queryClient = useQueryClient();
  const { plan, participants, activities } = view;
  const decision = plan.decision;
  const activity = activities.find((item) => item.id === decision?.activityId);
  const drumKey = seenKey(plan.id, decision?.decidedAt ?? "");
  // «В какой день?» для календаря, когда время не выбрано (V01). Хуки — до
  // раннего возврата с барабаном.
  const [askDay, setAskDay] = useState(false);
  const [day, setDay] = useState(() =>
    toDateInput(suggestedPlanDay(clock.now())),
  );
  const [showDrum, setShowDrum] = useState(
    () => decision?.method === "random" && !wasSeen(drumKey),
  );

  const cancel = useMutation({
    mutationFn: () => cancelPlanDecision(plan.id),
    onSuccess: (next) => {
      queryClient.setQueryData(planKeys.detail(plan.id), next);
      void queryClient.invalidateQueries({ queryKey: planKeys.list() });
    },
    onError: (error) =>
      toast(
        isApiError(error) ? error.message : "Не получилось. Попробуй ещё раз",
        { tone: "error" },
      ),
  });

  if (!decision || !activity) return null;

  if (showDrum) {
    const { pool } = decisionCandidates(plan, activities);
    const poolActivities = pool.flatMap((id) => {
      const item = activities.find((candidate) => candidate.id === id);
      return item ? [item] : [];
    });
    return (
      <RandomDrum
        pool={poolActivities.length > 0 ? poolActivities : [activity]}
        activityId={activity.id}
        onDone={() => {
          markSeen(drumKey);
          setShowDrum(false);
        }}
      />
    );
  }

  const timing = planWhen({
    decidedAt: new Date(decision.decidedAt).getTime(),
    mode: plan.mode,
    scheduledFor: decision.scheduledFor,
  });
  const live = timing.kind === "today";
  // «Прямо сейчас» — «Сегодня» (DESIGN.md §8.7, UX-аудит H3). «До даты» без
  // выбранного времени — не выдумываем его (auto-tasks V01): раньше здесь
  // стояла «Суббота, 12:00», которую никто не выбирал.
  const whenText =
    timing.kind === "today"
      ? "Сегодня"
      : timing.kind === "scheduled"
        ? formatWhen(timing.start)
        : "Когда — договоритесь в чате";
  const names = participants.map((person) => person.name).join(", ");

  const download = (start: Date, allDay: boolean) => {
    const ics = buildIcs(
      {
        uid: `${plan.id}-${decision.decidedAt}`,
        title: activity.title,
        start,
        allDay,
        durationMinutes: live
          ? LIVE_DURATION_MINUTES
          : Math.max(60, activity.durationMax || 120),
        description: `${plan.title}. Идут: ${names}`,
      },
      clock.now(),
    );
    downloadIcs("swipeit-plan.ics", ics);
  };

  // Время не выбрано — календарь спрашивает день и пишет событие на весь
  // день; иначе — сразу с выбранным временем.
  const addToCalendar = () => {
    if (timing.kind === "unscheduled") setAskDay(true);
    else download(timing.start, false);
  };

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div>
        <p className="text-title-3 text-rose">{plan.title}</p>
        <h2 className="text-display mt-1">Решено: {activity.title}</h2>
        <p className="text-body text-paper mt-2 first-letter:uppercase">
          {whenText}
        </p>
        <div className="mt-3 flex items-center gap-2">
          <AvatarStack
            people={participants.map((person) => ({
              id: person.id,
              name: person.name,
              color: person.avatarColor,
            }))}
            size={32}
          />
          <span className="text-caption text-rose">
            {decision.method === "random"
              ? "выбрал барабан"
              : decision.method === "vote"
                ? "выбрали голосованием"
                : "выбрал организатор"}
          </span>
        </div>
      </div>
      <div className="mx-auto w-full max-w-[300px]">
        <ActivityTicket activity={activity} />
      </div>
      <ShareActions
        getPayload={async () => ({
          title: plan.title,
          text:
            timing.kind === "unscheduled"
              ? `Решили: ${activity.title}. Когда — договоримся здесь`
              : `Решили: ${activity.title}, ${live ? "сегодня" : whenText}`,
          url: absoluteUrl(ROUTES.PLAN_SESSION(plan.id)),
        })}
        qrLabel="QR-код плана"
      />
      <Button
        size="lg"
        variant="secondary"
        icon={<CalendarPlus aria-hidden size={18} strokeWidth={1.75} />}
        onClick={addToCalendar}
      >
        Добавить в календарь
      </Button>
      <BottomSheet
        open={askDay}
        onClose={() => setAskDay(false)}
        title="В какой день?"
        footer={
          <Button
            size="lg"
            disabled={!day}
            onClick={() => {
              const [year = 0, month = 1, date = 1] = day
                .split("-")
                .map(Number);
              download(new Date(year, month - 1, date, 12), true);
              setAskDay(false);
            }}
          >
            Добавить
          </Button>
        }
      >
        <p className="text-body text-rose mb-4">
          Время ещё не выбрали — добавим событие на весь день.
        </p>
        <TextField
          label="День"
          type="date"
          value={day}
          onChange={(event) => setDay(event.target.value)}
        />
      </BottomSheet>
      {plan.ownerId === meId && (
        <Button
          variant="ghost"
          className="text-rose self-center"
          loading={cancel.isPending}
          onClick={() => cancel.mutate()}
        >
          Отменить решение
        </Button>
      )}
    </div>
  );
};
