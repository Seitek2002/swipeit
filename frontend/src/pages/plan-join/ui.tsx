"use client";

import { Suspense, useEffect } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { usePlan } from "@/entities/plan";

import { isApiError, joinPlan, planKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { setReturnTo } from "@/shared/lib/dom";
import { pluralize } from "@/shared/lib/format";
import { useSessionStore } from "@/shared/store";
import {
  AvatarStack,
  Brand,
  Button,
  EmptyState,
  Screen,
  ScreenBody,
  Skeleton,
  Splash,
  buttonClassName,
  toast,
} from "@/shared/ui";

// В local план живёт в браузере, где его создали (TECH_SPEC §8): на другом
// устройстве id не найдётся — объясняем и предлагаем свой план.
const NotHere = () => (
  <EmptyState
    className="h-full"
    object="ticket"
    title="В демо-версии присоединиться можно с этого же устройства или через локальную сеть. Открой ссылку в новой вкладке или посмотри, как играют демо-друзья."
    action={
      <Link
        href={ROUTES.PLAN_CREATE}
        className={buttonClassName({ variant: "secondary" })}
      >
        Создать свой план с демо-друзьями
      </Link>
    }
  />
);

const JoinContent = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = useSearchParams()?.get("id") ?? "";
  const meId = useSessionStore((state) => state.activeUserId);
  const plan = usePlan(meId ? id : undefined);
  const view = plan.data;
  const isMember = Boolean(
    view && meId && view.plan.participantIds.includes(meId),
  );

  useEffect(() => {
    if (isMember) router.replace(ROUTES.PLAN_SESSION(id));
  }, [isMember, id, router]);

  const join = useMutation({
    mutationFn: () => joinPlan(id),
    onSuccess: (next) => {
      queryClient.setQueryData(planKeys.detail(id), next);
      router.replace(ROUTES.PLAN_SESSION(id));
    },
    onError: (error) =>
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось вступить. Попробуй ещё раз",
        { tone: "error" },
      ),
  });

  // Без профиля — сначала познакомиться, потом вернуться сюда.
  if (!meId) {
    return (
      <EmptyState
        className="h-full"
        object="ticket"
        title="Тебя зовут в план. Сначала представься — это займёт минуту."
        action={
          <Button
            onClick={() => {
              setReturnTo(ROUTES.PLAN_JOIN(id));
              router.push(ROUTES.ONBOARDING);
            }}
          >
            Познакомиться
          </Button>
        }
      />
    );
  }
  if (!id || (isApiError(plan.error) && plan.error.code === "NOT_FOUND")) {
    return <NotHere />;
  }
  if (plan.isError) {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось открыть приглашение. Проверь связь и попробуй ещё раз."
        action={
          <Button variant="secondary" onClick={() => void plan.refetch()}>
            Попробовать ещё раз
          </Button>
        }
      />
    );
  }
  if (!view || isMember) {
    return (
      <div className="flex flex-col gap-4 px-5 pt-6">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton tone="paper" className="h-40 rounded-[22px]" />
      </div>
    );
  }

  const owner = view.participants.find(
    (person) => person.id === view.plan.ownerId,
  );
  const closed =
    view.plan.status === "results" || view.plan.status === "decided";

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 px-5 pt-4">
        <p className="text-title-3 text-rose">
          {owner ? `${owner.name} зовёт тебя` : "Тебя зовут"}
        </p>
        <h1 className="text-title-1 mt-1">{view.plan.title}</h1>
        <div className="paper rounded-paper shadow-paper mt-5 flex items-center gap-3 px-4 py-3.5">
          <AvatarStack
            people={view.participants.map((person) => ({
              id: person.id,
              name: person.name,
              color: person.avatarColor,
            }))}
            size={32}
            ring="paper"
          />
          <p className="text-caption text-ink-soft">
            {pluralize(view.participants.length, [
              "участник",
              "участника",
              "участников",
            ])}
            {" · "}
            {pluralize(view.activities.length, [
              "занятие",
              "занятия",
              "занятий",
            ])}
          </p>
        </div>
        <p className="text-body text-rose mt-5">
          Каждый свайпает занятия: вправо — «хочу», влево — «мимо». Что
          понравится всем — совпадение.
        </p>
      </div>
      <div className="flex-none px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {closed ? (
          <p className="text-caption text-rose text-center">
            Этот план уже выбрал занятие — вступить нельзя.
          </p>
        ) : (
          <Button
            size="lg"
            className="w-full"
            loading={join.isPending}
            onClick={() => join.mutate()}
          >
            Вступить
          </Button>
        )}
      </div>
    </div>
  );
};

// Приглашение в план по ссылке (TECH_SPEC §8): без таб-бара.
export const PlanJoinPage = () => (
  <Screen>
    <div className="flex h-[52px] flex-none items-center px-5">
      <Link href={ROUTES.HOME} aria-label="SwipeIt">
        <Brand size="sm" />
      </Link>
    </div>
    <ScreenBody>
      <Suspense fallback={<Splash />}>
        <JoinContent />
      </Suspense>
    </ScreenBody>
  </Screen>
);
