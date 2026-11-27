"use client";

import { useState } from "react";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Plus } from "lucide-react";

import { CustomActivitySheet } from "@/features/custom-activity";

import type { Activity } from "@/entities/activity";
import {
  type PlanView,
  computeMatches,
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
import { Button, EmptyState, toast } from "@/shared/ui";

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
  const total = participants.length;
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
    onSuccess,
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

  const header = (
    <div>
      <h2 className="text-title-1">{plan.title}</h2>
      <p className="text-title-3 text-rose mt-0.5">
        Совпало {matches.length} из {plan.deck.length}
      </p>
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
                    note:
                      likes === total
                        ? `все ${total} — «Все за»`
                        : `${likes} из ${total} — большинство за`,
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
                    note: `${likes} из ${total} — «Почти»`,
                  },
                ]
              : [];
          }),
        ];

  return (
    <div className="flex flex-col gap-5 pb-4">
      {header}
      {voting && (
        <p className="text-body text-rose">
          У каждого один голос.{" "}
          {isOwner
            ? "Когда все проголосуют — утверди победителя."
            : "Решение утвердит организатор."}
        </p>
      )}
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <ResultRow key={row.activity.id} {...row}>
            {voting && (
              <Button
                size="sm"
                variant={myVote === row.activity.id ? "primary" : "secondary"}
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
      <div className="flex flex-col gap-2">
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
                  loading={approve.isPending && approve.variables === id}
                  onClick={() => approve.mutate(id)}
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
            Крутить барабан
          </Button>
        ) : (
          <p className="text-caption text-rose text-center">
            Барабан крутит организатор — все увидят, что выпало.
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
    </div>
  );
};
