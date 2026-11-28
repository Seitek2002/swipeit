"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";

import { CustomActivitySheet } from "@/features/custom-activity";

import type { Activity } from "@/entities/activity";
import {
  type PlanView,
  computeMatches,
  countedParticipants,
  decisionCandidates,
  tallyVotes,
  voteCandidates,
} from "@/entities/plan";

import {
  addPlanActivities,
  decidePlan,
  isApiError,
  planKeys,
  votePlan,
} from "@/shared/api";
import { withBasePath } from "@/shared/lib/base-path";
import { pluralize } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Button, ConfirmDialog, EmptyState, toast } from "@/shared/ui";

import {
  approveWarning,
  drumLabels,
  resultNote,
  voteProgress,
  voteStatus,
} from "../model";

type Props = { meId: string; view: PlanView };

// Мини-билетик строки итогов: фото, название, подпись «все 4 ✔︎ — «Все за»».
const ResultRow = ({
  activity,
  note,
  strong,
  children,
}: {
  activity: Activity;
  children?: React.ReactNode;
  note: string;
  strong: boolean;
}) => (
  <li className="paper rounded-paper shadow-paper flex items-center gap-3 p-2.5">
    <div className="bg-paper-2 size-16 flex-none overflow-hidden rounded-[14px]">
      {activity.image && (
        <img
          src={withBasePath(activity.image.src)}
          alt=""
          className="size-full object-cover"
        />
      )}
    </div>
    <div className="min-w-0 flex-1">
      <p className="text-title-3 line-clamp-2">{activity.title}</p>
      <p
        className={cn(
          "text-caption mt-0.5 flex items-center gap-1",
          strong ? "text-ink" : "text-ink-soft",
        )}
      >
        {strong && <Check aria-hidden size={14} strokeWidth={2.25} />}
        {note}
      </p>
    </div>
    {children}
  </li>
);

// Итоги плана (DESIGN.md §8.7 «Результаты»): совпадения и «почти»,
// «Крутить барабан» и «Выбрать самим»; совпадений нет — два выхода.
export const Results = ({ view, meId }: Props) => {
  const queryClient = useQueryClient();
  const { plan, participants, activities } = view;
  const isOwner = plan.ownerId === meId;
  // Чьи свайпы в итогах: после «Показать итоги сейчас» — только долиставших.
  const counted = new Set(countedParticipants(plan));
  const total = counted.size;
  const closedEarly = Boolean(plan.closedEarly);
  const countedNames = participants
    .filter((person) => counted.has(person.id))
    .map((person) => person.name);
  const byId = new Map(activities.map((activity) => [activity.id, activity]));
  const { matches, almost } = computeMatches(plan, activities);
  const candidates = decisionCandidates(plan, activities);
  const votable = voteCandidates(plan, activities);
  const tally = tallyVotes(plan, activities);
  // Голосование у всех, как только кто-то проголосовал: «Выбрать самим»
  // нажимают на одном телефоне, а голосовать должны все.
  const hasVotes = Object.keys(tally.counts).length > 0;
  const [votingToggle, setVoting] = useState(false);
  const voting = votingToggle || hasVotes;
  const [customOpen, setCustomOpen] = useState(false);
  // Кого ждём в голосовании (X04): пока не все, «Утвердить» — вторичная и
  // спрашивает подтверждение; все — главная и утверждает сразу.
  const progress = voteProgress(participants, plan.votes, votable);
  const warning = approveWarning(progress);
  const [confirmId, setConfirmId] = useState<null | string>(null);

  const onSuccess = (next: PlanView) => {
    queryClient.setQueryData(planKeys.detail(plan.id), next);
    void queryClient.invalidateQueries({ queryKey: planKeys.list() });
  };
  const onError = (error: Error) =>
    toast(
      isApiError(error) ? error.message : "Не получилось. Попробуй ещё раз",
      { tone: "error" },
    );
  const spin = useMutation({
    mutationFn: () => decidePlan(plan.id, { method: "random" }),
    onSuccess,
    onError,
  });
  const approve = useMutation({
    mutationFn: (activityId: string) =>
      decidePlan(plan.id, { method: "vote", activityId }),
    onSuccess: (next: PlanView) => {
      setConfirmId(null);
      onSuccess(next);
    },
    onError,
  });
  const vote = useMutation({
    mutationFn: (activityId: string) => votePlan(plan.id, activityId),
    onSuccess,
    onError,
  });
  const addMore = useMutation({
    mutationFn: (activityId: string) =>
      addPlanActivities(plan.id, [activityId]),
    onSuccess,
    onError,
  });

  // Голоса — тем же подсчётом, что у сервера: только нынешние участники и
  // только за варианты; ничья — несколько лидеров.
  const votes = new Map(Object.entries(tally.counts));
  const myVote = plan.votes[meId];

  const labels = drumLabels(candidates.source);
  const header = (
    <div>
      <h2 className="text-title-1">{plan.title}</h2>
      <p className="text-title-3 text-rose mt-0.5">
        Совпало {matches.length} из {plan.deck.length}
      </p>
      {closedEarly && (
        <p className="text-caption text-rose mt-1">
          Итоги по тем, кто долистал: {countedNames.join(", ")}
        </p>
      )}
      {/* Не долистал, а итоги уже показали (X06) — говорим прямо, иначе
          человек ищет в списке свои лайки и не понимает, куда они делись. */}
      {closedEarly && !counted.has(meId) && (
        <p className="text-body text-paper mt-1.5">
          Итоги показали без тебя: организатор не стал ждать
        </p>
      )}
      {labels.hint && !voting && (
        <p className="text-body text-rose mt-1.5">{labels.hint}</p>
      )}
    </div>
  );

  if (candidates.source === "none" && !voting) {
    return (
      <div className="flex flex-col gap-6 pb-4">
        {header}
        <EmptyState
          object="ticket"
          title={
            isOwner
              ? "Совпадений нет. Добавь ещё занятий — все досвайпают новые — или выберите сами."
              : "Совпадений нет. Организатор может добавить занятий — или выберите сами."
          }
          action={
            !isOwner ? (
              <Button variant="secondary" onClick={() => setVoting(true)}>
                Выбрать самим
              </Button>
            ) : isOwner ? (
              <div className="flex flex-col gap-2">
                <Button
                  variant="secondary"
                  icon={<Plus aria-hidden size={18} strokeWidth={2} />}
                  loading={addMore.isPending}
                  onClick={() => setCustomOpen(true)}
                >
                  Добавить ещё занятий
                </Button>
                <Button variant="ghost" onClick={() => setVoting(true)}>
                  Выбрать самим
                </Button>
              </div>
            ) : undefined
          }
        />
        <CustomActivitySheet
          open={customOpen}
          onClose={() => setCustomOpen(false)}
          onCreated={(activity) => addMore.mutate(activity.id)}
        />
      </div>
    );
  }

  const rows: Array<{ activity: Activity; note: string; strong: boolean }> =
    voting
      ? votable.flatMap((id) => {
          const activity = byId.get(id);
          const count = votes.get(id) ?? 0;
          return activity
            ? [
                {
                  activity,
                  strong: count > 0,
                  note: count
                    ? pluralize(count, ["голос", "голоса", "голосов"])
                    : "пока без голосов",
                },
              ]
            : [];
        })
      : [
          ...matches.flatMap(({ activityId, likes }) => {
            const activity = byId.get(activityId);
            return activity
              ? [
                  {
                    activity,
                    strong: true,
                    note: resultNote("match", likes, total, closedEarly),
                  },
                ]
              : [];
          }),
          ...almost.flatMap(({ activityId, likes }) => {
            const activity = byId.get(activityId);
            return activity
              ? [
                  {
                    activity,
                    strong: false,
                    note: resultNote("almost", likes, total, closedEarly),
                  },
                ]
              : [];
          }),
        ];

  return (
    <div className="flex flex-col gap-5 pb-4">
      {header}
      {voting && (
        <div className="flex flex-col gap-1.5">
          <p className="text-body text-rose">
            У каждого один голос.{" "}
            {isOwner
              ? "Когда все проголосуют — утверди победителя."
              : "Решение утвердит организатор."}
          </p>
          <p
            className={cn(
              "text-caption",
              warning ? "text-rose" : "text-mint flex items-center gap-1",
            )}
            aria-live="polite"
          >
            {!warning && <Check aria-hidden size={14} strokeWidth={2.25} />}
            {voteStatus(progress)}
          </p>
        </div>
      )}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <ResultRow key={row.activity.id} {...row}>
            {voting && (
              <Button
                size="sm"
                // Свой голос — бумага с галочкой, а не мандарин: мандарин на
                // экране один (DESIGN.md §1, принцип 2; auto-tasks V07).
                variant={myVote === row.activity.id ? "paper" : "secondary"}
                icon={
                  myVote === row.activity.id ? (
                    <Check aria-hidden size={16} strokeWidth={2.25} />
                  ) : undefined
                }
                aria-pressed={myVote === row.activity.id}
                aria-label={`${myVote === row.activity.id ? "Мой голос" : "Голос"} за: ${row.activity.title}`}
                loading={vote.isPending && vote.variables === row.activity.id}
                onClick={() => vote.mutate(row.activity.id)}
              >
                {myVote === row.activity.id ? "Мой голос" : "Голос"}
              </Button>
            )}
          </ResultRow>
        ))}
      </ul>
      {/* Действия — в липком низу (auto-tasks U08): при 9 совпадениях
          «Крутить барабан» уезжал на второй экран. Список прокручивается над
          ним, бархатный градиент отделяет кнопки от карточек. Липкий блок
          прилипает к краю содержимого прокрутки, то есть выше её нижнего
          отступа, — отсюда отрицательный bottom: иначе в этом отступе
          между кнопками и краем экрана просвечивали строки (W08). */}
      <div className="from-velvet sticky bottom-[calc(-1*var(--tabbar-space))] z-10 -mx-5 -mb-[calc(var(--tabbar-space)+1rem)] flex flex-col gap-2 bg-linear-to-t from-85% to-transparent px-5 pt-6 pb-[calc(env(safe-area-inset-bottom)+var(--tabbar-space)+12px)]">
        {voting ? (
          isOwner && (
            <>
              {tally.leaders.length === 0 && (
                <p className="text-caption text-rose text-center">
                  Пока никто не проголосовал
                </p>
              )}
              {tally.leaders.length > 1 && (
                <p className="text-caption text-rose text-center">
                  Ничья — утверди любого из лидеров
                </p>
              )}
              {tally.leaders.map((id) => (
                <Button
                  key={id}
                  size="lg"
                  // Ничья — несколько «Утвердить»: ни одна не главная (V07).
                  // Проголосовали не все — тоже не главная (X04): утвердить
                  // при одном голосе — «решили без нас».
                  variant={
                    tally.leaders.length > 1 || warning
                      ? "secondary"
                      : "primary"
                  }
                  loading={
                    !confirmId && approve.isPending && approve.variables === id
                  }
                  onClick={() =>
                    warning ? setConfirmId(id) : approve.mutate(id)
                  }
                >
                  Утвердить: {byId.get(id)?.title ?? ""}
                </Button>
              ))}
            </>
          )
        ) : isOwner ? (
          <Button
            size="lg"
            loading={spin.isPending}
            onClick={() => spin.mutate()}
          >
            {labels.button}
          </Button>
        ) : (
          <p className="text-caption text-rose text-center">
            {labels.forGuests}
          </p>
        )}
        {!(voting && hasVotes) && (
          <Button
            size="lg"
            variant="secondary"
            onClick={() => setVoting(!voting)}
          >
            {voting ? "Назад к совпадениям" : "Выбрать самим"}
          </Button>
        )}
      </div>
      <ConfirmDialog
        open={confirmId !== null}
        onClose={() => setConfirmId(null)}
        onConfirm={() => confirmId && approve.mutate(confirmId)}
        isLoading={approve.isPending}
        title={`Утвердить: ${byId.get(confirmId ?? "")?.title ?? ""}`}
        description={warning ?? undefined}
        confirmLabel="Утвердить"
      />
    </div>
  );
};
