"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { type PlanView, formatDeadline } from "@/entities/plan";

import { closePlan, isApiError, planKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { absoluteUrl } from "@/shared/lib/dom";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ShareActions,
  toast,
} from "@/shared/ui";

import { joinNames } from "./names";

// Сколько должны долистать, чтобы показать итоги раньше (как в моке).
const MIN_FINISHED_TO_CLOSE = 2;

type Props = {
  meId: string;
  // Кто ещё листает — не долистал колоду.
  swiping: ReadonlyArray<{ id: string; name: string }>;
  view: PlanView;
};

// «Колода закончилась» без тупика (auto-tasks P04, PRD §6.3 «решение за 5
// минут»): видно, кто ещё листает, им можно напомнить в чате, а организатор
// может показать итоги, не дожидаясь бросивших колоду.
export const DeckEnd = ({ view, meId, swiping }: Props) => {
  const { plan } = view;
  const queryClient = useQueryClient();
  const [confirm, setConfirm] = useState(false);
  const isOwner = plan.ownerId === meId;
  const finished = plan.participantIds.filter((id) =>
    plan.finishedIds.includes(id),
  ).length;
  const names = joinNames(swiping.map((person) => person.name));

  const close = useMutation({
    mutationFn: () => closePlan(plan.id),
    onSuccess: (next) => {
      queryClient.setQueryData(planKeys.detail(plan.id), next);
      void queryClient.invalidateQueries({ queryKey: planKeys.list() });
      setConfirm(false);
    },
    onError: (error) =>
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось показать итоги. Попробуй ещё раз",
        { tone: "error" },
      ),
  });

  const deadline =
    plan.mode === "deadline" && plan.deadline
      ? formatDeadline(plan.deadline).replace(/^До /, "")
      : null;

  return (
    <div className="flex h-full flex-col items-center justify-center gap-5 px-6">
      <EmptyState
        object="ticket"
        title={
          deadline
            ? `Колода закончилась. Итоги откроются, когда закончат все, но не позже ${deadline}.`
            : "Колода закончилась. Итоги откроются, когда закончат все."
        }
      />
      {swiping.length > 0 && (
        <div className="flex w-full flex-col items-center gap-3">
          <p className="text-body text-rose text-center">
            {names} {swiping.length === 1 ? "ещё листает" : "ещё листают"}
          </p>
          <ShareActions
            secondary
            qrLabel="QR-код приглашения в план"
            getPayload={async () => ({
              title: plan.title,
              text: `${names} — долистайте план «${plan.title}», без вас итоги не откроются`,
              url: absoluteUrl(ROUTES.PLAN_JOIN(plan.id)),
            })}
          />
          {isOwner && finished >= MIN_FINISHED_TO_CLOSE && (
            <Button
              variant="secondary"
              size="lg"
              className="w-full"
              onClick={() => setConfirm(true)}
            >
              Показать итоги сейчас
            </Button>
          )}
        </div>
      )}
      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        onConfirm={() => close.mutate()}
        isLoading={close.isPending}
        title="Показать итоги сейчас?"
        description={`Свайпы, которых нет (${names}), в итоги не попадут. Совпадения посчитаем по тем, кто долистал.`}
        confirmLabel="Показать итоги"
      />
    </div>
  );
};
