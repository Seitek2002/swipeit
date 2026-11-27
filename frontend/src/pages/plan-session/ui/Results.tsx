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
  const [voting, setVoting] = useState(Object.keys(plan.votes).length > 0);
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

  // Голоса: activityId → сколько.
  const votes = new Map<string, number>();
  for (const activityId of Object.values(plan.votes)) {
    votes.set(activityId, (votes.get(activityId) ?? 0) + 1);
  }
  const myVote = plan.votes[meId];
  const leader = [...votes.entries()].sort((a, b) => b[1] - a[1])[0];

  const header = (
    <div>
      <h1 className="text-title-1">{plan.title}</h1>
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
              : "Совпадений нет. Ждём, что решит организатор."
          }
          action={
            isOwner ? (
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
            <Button
              size="lg"
              disabled={!leader}
              loading={approve.isPending}
              onClick={() => leader && approve.mutate(leader[0])}
            >
              {leader
                ? `Утвердить: ${byId.get(leader[0])?.title ?? ""}`
                : "Утвердить"}
            </Button>
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
        <Button
          size="lg"
          variant="secondary"
          onClick={() => setVoting(!voting)}
        >
          {voting ? "Назад к совпадениям" : "Выбрать самим"}
        </Button>
      </div>
    </div>
  );
};
