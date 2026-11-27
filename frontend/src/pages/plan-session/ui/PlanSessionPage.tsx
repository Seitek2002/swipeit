"use client";

import { Suspense, useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { AppHeader } from "@/widgets/app-header";

import { usePlan } from "@/entities/plan";

import { isApiError } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { useSessionStore } from "@/shared/store";
import {
  Button,
  EmptyState,
  Screen,
  ScreenBody,
  Skeleton,
  Splash,
} from "@/shared/ui";

import { Lobby } from "./Lobby";

const SessionContent = () => {
  const router = useRouter();
  const id = useSearchParams()?.get("id") ?? undefined;
  const meId = useSessionStore((state) => state.activeUserId);
  const plan = usePlan(id);
  const view = plan.data;
  const isMember = Boolean(
    view && meId && view.plan.participantIds.includes(meId),
  );

  // Открыл план, в котором не участвуешь, — сначала приглашение.
  useEffect(() => {
    if (id && view && !isMember) router.replace(ROUTES.PLAN_JOIN(id));
  }, [id, view, isMember, router]);

  if (!id || (isApiError(plan.error) && plan.error.code === "NOT_FOUND")) {
    return (
      <EmptyState
        className="h-full"
        object="ticket"
        title="Такого плана нет."
      />
    );
  }
  if (plan.isError) {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось загрузить план. Проверь связь и попробуй ещё раз."
        action={
          <Button variant="secondary" onClick={() => void plan.refetch()}>
            Попробовать ещё раз
          </Button>
        }
      />
    );
  }
  if (!view || !meId || !isMember) {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-60" />
      </div>
    );
  }

  if (view.plan.status === "lobby") return <Lobby view={view} meId={meId} />;

  // Свайп, результаты и «Решено» — T14–T15.
  return (
    <EmptyState
      className="h-full"
      object="ticket"
      title={
        view.plan.status === "swiping"
          ? "Колода готова. Свайп билетиков появится в следующем шаге демо."
          : "Итоги плана появятся в следующем шаге демо."
      }
    />
  );
};

// Экран плана (DESIGN.md §8.7): лобби → свайп → результаты → решено.
export const PlanSessionPage = () => (
  <Screen>
    <AppHeader
      title="План"
      showBack
      backHref={ROUTES.PLANS}
      showAvatar={false}
    />
    <ScreenBody className="px-5 pt-2">
      <Suspense fallback={<Splash />}>
        <SessionContent />
      </Suspense>
    </ScreenBody>
  </Screen>
);
