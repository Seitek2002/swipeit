"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Crown } from "lucide-react";

import { LeavePlanButton } from "@/features/leave-plan";

import type { PlanView } from "@/entities/plan";

import { isApiError, planKeys, setPlanReady, startPlan } from "@/shared/api";
import { inviteUrl, usePrefetchInvite } from "@/shared/lib/dom";
import { pluralize } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { Avatar, Button, DemoLinkNote, ShareActions, toast } from "@/shared/ui";

const MIN_READY = 2;

// Лобби плана «Прямо сейчас» (DESIGN.md §8.7): участники с отметкой
// «готов», «Готов» у участника, «Поехали» у организатора, когда готовы ≥ 2,
// и ссылка-приглашение для тех, кого не позвали при создании.
export const Lobby = ({ view, meId }: { meId: string; view: PlanView }) => {
  const queryClient = useQueryClient();
  const { plan, participants, activities } = view;
  const isOwner = plan.ownerId === meId;
  const isReady = plan.readyIds.includes(meId);
  const readyCount = plan.readyIds.length;
  // Главная кнопка лобби — «Поехали» у организатора и «Готов» у участника;
  // отправка приглашения становится главной, только когда участник уже
  // готов и внизу осталось вторичное «Отменить» (DESIGN.md §1: мандарин один).
  const shareIsMain = !isOwner && isReady;

  const onSuccess = (next: PlanView) => {
    queryClient.setQueryData(planKeys.detail(plan.id), next);
    void queryClient.invalidateQueries({ queryKey: planKeys.list() });
  };
  const onError = (error: Error) =>
    toast(
      isApiError(error) ? error.message : "Не получилось. Попробуй ещё раз",
      { tone: "error" },
    );

  const ready = useMutation({
    mutationFn: (next: boolean) => setPlanReady(plan.id, next),
    onSuccess,
    onError,
  });
  const start = useMutation({
    mutationFn: () => startPlan(plan.id),
    onSuccess,
    onError,
  });

  usePrefetchInvite("plan", plan.id);
  const getPayload = async () => ({
    title: plan.title,
    text: `Че делать будем? Зову в план «${plan.title}» — свайпнем занятия и посмотрим, что совпадёт`,
    url: await inviteUrl("plan", plan.id),
  });

  return (
    <div className="flex flex-col gap-6 pb-4">
      <div>
        <h2 className="text-title-1">{plan.title}</h2>
        <p className="text-title-3 text-rose mt-0.5">
          Прямо сейчас,{" "}
          {pluralize(activities.length, ["занятие", "занятия", "занятий"])} в
          колоде
        </p>
      </div>

      <section>
        <p className="text-label mb-1">
          Готовы {readyCount} из {participants.length}
        </p>
        <ul aria-label="Участники">
          {participants.map((person) => {
            const personReady = plan.readyIds.includes(person.id);
            return (
              <li
                key={person.id}
                className="border-line flex min-h-[60px] items-center gap-3.5 border-b"
              >
                <Avatar
                  name={person.name}
                  color={person.avatarColor}
                  size={40}
                  decorative
                />
                <span className="text-body text-paper flex flex-1 items-center gap-1.5 font-semibold">
                  {person.name}
                  {person.id === meId && (
                    <span className="text-caption text-rose font-normal">
                      (ты)
                    </span>
                  )}
                  {person.id === plan.ownerId && (
                    <Crown
                      aria-label="организатор"
                      size={16}
                      strokeWidth={1.75}
                      className="text-champagne"
                    />
                  )}
                </span>
                <span
                  className={cn(
                    "text-caption inline-flex items-center gap-1",
                    personReady ? "text-mint" : "text-rose",
                  )}
                >
                  {personReady && (
                    <Check aria-hidden size={16} strokeWidth={2.25} />
                  )}
                  {personReady ? "готов" : "ждём"}
                </span>
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3">
        <p className="text-label">Позвать ещё</p>
        <ShareActions
          getPayload={getPayload}
          qrLabel="QR-код приглашения в план"
          secondary={!shareIsMain}
        />
        <DemoLinkNote />
      </section>

      <div className="flex flex-col gap-2">
        {isOwner ? (
          <>
            <Button
              size="lg"
              disabled={readyCount < MIN_READY}
              loading={start.isPending}
              onClick={() => start.mutate()}
            >
              Поехали
            </Button>
            {readyCount < MIN_READY && (
              <p className="text-caption text-rose text-center">
                Нужен хотя бы ещё один готовый участник
              </p>
            )}
          </>
        ) : (
          <Button
            size="lg"
            variant={isReady ? "secondary" : "primary"}
            loading={ready.isPending}
            onClick={() => ready.mutate(!isReady)}
          >
            {isReady ? "Отменить «Готов»" : "Готов"}
          </Button>
        )}
        {!isOwner && <LeavePlanButton planId={plan.id} title={plan.title} />}
      </div>
    </div>
  );
};
