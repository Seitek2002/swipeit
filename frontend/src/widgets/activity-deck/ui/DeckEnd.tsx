"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Bell } from "lucide-react";

import { type PlanView, formatDeadline } from "@/entities/plan";

import { closePlan, isApiError, planKeys } from "@/shared/api";
import { copyText, inviteUrl, usePrefetchInvite } from "@/shared/lib/dom";
import {
  Button,
  ConfirmDialog,
  EmptyState,
  ShareActions,
  toast,
} from "@/shared/ui";

import { type Lagging, deckEndLines, joinNames, remindText } from "../model";

// Сколько должны долистать, чтобы показать итоги раньше (как в моке).
const MIN_FINISHED_TO_CLOSE = 2;

type Props = {
  meId: string;
  // Кто ещё листает — не долистал колоду, и сколько ему осталось.
  swiping: ReadonlyArray<Lagging & { id: string }>;
  view: PlanView;
};

// «Колода закончилась» без тупика (auto-tasks P04, PRD §6.3 «решение за 5
// минут»): видно, кто ещё листает, им можно напомнить в чате, а организатор
// может показать итоги, не дожидаясь бросивших колоду. Организатору —
// «Напомнить» с именами и сколько осталось (X06): раньше у него была только
// ссылка-приглашение, которую отстающий уже открывал.
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

  // Текст и ссылка — одной строкой, как «Скопировать» в ShareActions: в
  // чат вставляется сразу готовое сообщение. Ссылка — та же, что в
  // приглашении: участника /plans/join сразу переводит в колоду плана.
  usePrefetchInvite("plan", plan.id, swiping.length > 0);
  const remind = async () => {
    const text = remindText(swiping, plan.title);
    const url = await inviteUrl("plan", plan.id).catch(() => null);
    if (!url) {
      toast("Не получилось собрать ссылку", { tone: "error" });
      return;
    }
    const ok = await copyText(`${text} ${url}`);
    toast(ok ? "Текст со ссылкой скопирован" : "Не получилось скопировать", {
      tone: ok ? "success" : "error",
    });
  };

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
          {/* «ещё листают» — только начавшие; у кого 0 карточек — «ещё не
              открывали» (Y08). */}
          <div className="flex flex-col gap-1">
            {deckEndLines(swiping).map((line) => (
              <p key={line} className="text-body text-rose text-center">
                {line}
              </p>
            ))}
          </div>
          {isOwner ? (
            <Button
              size="lg"
              className="w-full"
              icon={<Bell aria-hidden size={18} strokeWidth={2} />}
              onClick={() => void remind()}
            >
              Напомнить
            </Button>
          ) : (
            <ShareActions
              secondary
              qrLabel="QR-код приглашения в план"
              getPayload={async () => ({
                title: plan.title,
                text: `${names} — долистайте план «${plan.title}», без вас итоги не откроются`,
                url: await inviteUrl("plan", plan.id),
              })}
            />
          )}
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
