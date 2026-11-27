"use client";

import { type ReactNode, Suspense, useEffect } from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { ActivityDeck } from "@/widgets/activity-deck";
import { AppHeader } from "@/widgets/app-header";
import { MatchOverlay } from "@/widgets/match-overlay";

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

import { Decided } from "./Decided";
import { Lobby } from "./Lobby";
import { Results } from "./Results";

// Обычный экран плана: шапка с «назад» и прокрутка.
const Framed = ({ children }: { children: ReactNode }) => (
  <>
    <AppHeader
      title="План"
      showBack
      backHref={ROUTES.PLANS}
      showAvatar={false}
    />
    <ScreenBody className="px-5 pt-2">{children}</ScreenBody>
  </>
);

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
      <Framed>
        <EmptyState
          className="h-full"
          object="ticket"
          title="Такого плана нет."
        />
      </Framed>
    );
  }
  if (plan.isError) {
    return (
      <Framed>
        <EmptyState
          className="h-full"
          title="Не получилось загрузить план. Проверь связь и попробуй ещё раз."
          action={
            <Button variant="secondary" onClick={() => void plan.refetch()}>
              Попробовать ещё раз
            </Button>
          }
        />
      </Framed>
    );
  }
  if (!view || !meId || !isMember) {
    return (
      <Framed>
        <div className="flex flex-col gap-4 pt-2">
          <Skeleton className="h-9 w-2/3" />
          <Skeleton className="h-60" />
        </div>
      </Framed>
    );
  }

  // Лобби → свайп (колода на весь экран, вместо таб-бара «Выйти»; в «До
  // даты» в шапке обратный отсчёт) → итоги → «Решено».
  const body =
    view.plan.status === "lobby" ? (
      <Framed>
        <Lobby view={view} meId={meId} />
      </Framed>
    ) : view.plan.status === "swiping" ? (
      <ActivityDeck view={view} meId={meId} />
    ) : (
      <Framed>
        {view.plan.status === "decided" ? (
          <Decided view={view} meId={meId} />
        ) : (
          <Results view={view} meId={meId} />
        )}
      </Framed>
    );

  // Оверлей «Совпадение» — на одном месте при любом статусе: последний
  // свайп может и дать совпадение, и перевести план к итогам — оверлей не
  // должен при этом пересоздаться и потерять событие.
  return (
    <>
      {body}
      <MatchOverlay view={view} />
    </>
  );
};

// Экран плана (DESIGN.md §8.7): лобби → свайп → результаты → решено.
export const PlanSessionPage = () => (
  <Screen>
    <Suspense fallback={<Splash />}>
      <SessionContent />
    </Suspense>
  </Screen>
);
