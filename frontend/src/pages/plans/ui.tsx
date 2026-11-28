"use client";

import Link from "next/link";

import { Plus } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";

import {
  PLAN_NEED_LABELS,
  type PlanSummary,
  planNeedsMe,
  planStatus,
  readPlanSeen,
  usePlanSeenVersion,
  usePlans,
} from "@/entities/plan";

import { ROUTES } from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";
import { cn } from "@/shared/lib/utils";
import { useSessionStore } from "@/shared/store";
import {
  AvatarStack,
  Button,
  EmptyState,
  Screen,
  ScreenBody,
  Skeleton,
  buttonClassName,
} from "@/shared/ui";

// Билетик-превью плана (DESIGN.md §8.7): название, режим, участники,
// статус и мини-фото занятий колоды.
const PlanCard = ({ summary }: { summary: PlanSummary }) => {
  const { plan, participants, preview, activityCount } = summary;
  const decision = plan.decision
    ? preview.find((activity) => activity.id === plan.decision?.activityId)
    : undefined;
  const meId = useSessionStore((state) => state.activeUserId);
  usePlanSeenVersion();
  // Ждут меня (Q09): «Ждём тебя» и «Твой голос» вместо обычного статуса;
  // непросмотренные итоги — тот же статус, но выделен.
  const need = planNeedsMe(plan, meId, readPlanSeen(plan.id));
  const base = planStatus(plan, decision?.title);
  const status =
    need === "swipe" || need === "vote"
      ? { live: false, text: PLAN_NEED_LABELS[need] }
      : base;
  const photos = preview.filter((activity) => activity.image).slice(0, 3);

  return (
    <li>
      <Link
        href={ROUTES.PLAN_SESSION(plan.id)}
        className="paper rounded-paper shadow-paper flex items-center gap-3 p-3.5"
      >
        <div className="min-w-0 flex-1">
          <p className="text-title-2 line-clamp-2">{plan.title}</p>
          <p
            className={cn(
              "text-caption mt-0.5 flex items-center gap-1.5",
              need
                ? "text-mandarin-ink font-semibold"
                : status.live
                  ? "text-ink"
                  : "text-ink-soft",
            )}
          >
            {status.live && (
              <span aria-hidden className="bg-mint size-2 rounded-full" />
            )}
            {status.text}
          </p>
          <div className="mt-2.5 flex items-center gap-2">
            <AvatarStack
              people={participants.map((person) => ({
                id: person.id,
                name: person.name,
                color: person.avatarColor,
              }))}
              size={26}
              ring="paper"
            />
            <span className="text-caption text-ink-soft">
              {activityCount} в колоде
            </span>
          </div>
        </div>
        {photos.length > 0 && (
          <div aria-hidden className="relative h-[72px] w-[84px] flex-none">
            {photos.map((activity, index) => (
              <img
                key={activity.id}
                src={withBasePath(activity.image?.src ?? "")}
                alt=""
                className={cn(
                  "border-paper absolute top-0 h-[60px] w-[48px] rounded-[10px] border-2 object-cover shadow-[0_4px_10px_rgb(10_0_8/0.25)]",
                  index === 0 && "left-0 -rotate-6",
                  index === 1 && "left-[18px] z-[1] mt-1.5",
                  index === 2 && "left-[36px] rotate-6",
                )}
              />
            ))}
          </div>
        )}
      </Link>
    </li>
  );
};

// «Че делать будем?» — список планов (DESIGN.md §8.7).
export const PlansPage = () => {
  const plans = usePlans();
  const list = plans.data ?? [];

  return (
    <Screen>
      <AppHeader title="Планы" />
      <ScreenBody className="px-5 pt-2">
        {plans.isError ? (
          <EmptyState
            className="h-full"
            title="Не получилось загрузить планы. Проверь связь и попробуй ещё раз."
            action={
              <Button variant="secondary" onClick={() => void plans.refetch()}>
                Попробовать ещё раз
              </Button>
            }
          />
        ) : !plans.data ? (
          <div className="flex flex-col gap-3">
            {[0, 1].map((index) => (
              <Skeleton
                key={index}
                tone="paper"
                className="h-[104px] rounded-[22px]"
              />
            ))}
          </div>
        ) : list.length === 0 ? (
          <EmptyState
            className="h-full"
            object="ticket"
            title="Че делать будем? Собери друзей — каждый свайпнет занятия, и совпадения покажут, куда идти."
            action={
              <Link
                href={ROUTES.PLAN_CREATE}
                className={buttonClassName({ size: "lg" })}
              >
                Новый план
              </Link>
            }
          />
        ) : (
          <ul className="flex flex-col gap-3 pb-24">
            {list.map((summary) => (
              <PlanCard key={summary.plan.id} summary={summary} />
            ))}
          </ul>
        )}
      </ScreenBody>
      {list.length > 0 && (
        <div className="from-velvet pointer-events-none absolute inset-x-0 bottom-0 z-30 bg-linear-to-t from-60% to-transparent px-5 pt-7 pb-[calc(var(--tabbar-space)-8px)]">
          <Link
            href={ROUTES.PLAN_CREATE}
            className={cn(
              buttonClassName({ size: "lg" }),
              "pointer-events-auto w-full",
            )}
          >
            <Plus aria-hidden size={20} strokeWidth={2} />
            Новый план
          </Link>
        </div>
      )}
    </Screen>
  );
};
