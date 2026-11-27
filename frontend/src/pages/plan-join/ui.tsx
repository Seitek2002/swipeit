"use client";

import { type ReactNode, Suspense, useEffect } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { NAME_CAPTIONS, useRequireName } from "@/features/ask-name";

import { usePlan } from "@/entities/plan";
import { useCreateUser } from "@/entities/user";

import { getPlan, isApiError, joinPlan, planKeys } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { pluralize } from "@/shared/lib/format";
import { useSessionStore } from "@/shared/store";
import {
  AvatarStack,
  Brand,
  Button,
  ContentSkeleton,
  EmptyState,
  Screen,
  ScreenBody,
  buttonClassName,
  toast,
} from "@/shared/ui";

// В local план живёт в браузере, где его создали (TECH_SPEC §8): на другом
// устройстве id не найдётся — объясняем и предлагаем свой план.
const NotHere = () => (
  <EmptyState
    className="h-full"
    object="ticket"
    title="В демо-версии присоединиться можно только с этого же устройства (ссылка в новой вкладке) или через режим «Локальная сеть». А пока посмотри, как играют демо-друзья."
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

// Гость без профиля: что за приглашение, и «Вступить» — профиль создастся
// сам. Ошибка — под кнопкой, повтор — той же кнопкой.
const GuestInvite = ({
  title,
  loading,
  failed,
  onJoin,
}: {
  failed: boolean;
  loading: boolean;
  onJoin: () => void;
  title: string;
}) => (
  <EmptyState
    className="h-full"
    object="ticket"
    title={title}
    action={
      <>
        <Button size="lg" loading={loading} onClick={onJoin}>
          Вступить
        </Button>
        {failed && (
          <p role="alert" className="text-caption text-rose">
            Не получилось. Проверь связь и попробуй ещё раз
          </p>
        )}
      </>
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

  // Нет имени — NameSheet «Так тебя увидят в плане» по «Вступить» (DESIGN.md
  // §8.7), потом вступление само; NAME_REQUIRED от сервера — та же шторка.
  const requireName = useRequireName(NAME_CAPTIONS.plan);
  const join = useMutation({
    mutationFn: () => joinPlan(id),
    onSuccess: (next) => {
      queryClient.setQueryData(planKeys.detail(id), next);
      router.replace(ROUTES.PLAN_SESSION(id));
    },
    onError: (error) => {
      if (requireName.handleError(error, () => join.mutate())) return;
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось вступить. Попробуй ещё раз",
        { tone: "error" },
      );
    },
  });

  // Без профиля «Вступить» создаёт его сам (TECH_SPEC §10). План читаем уже
  // от нового профиля: если вступить можно — NameSheet, потом вступление.
  const createUser = useCreateUser();
  const joinAsNew = () =>
    createUser.mutate(undefined, {
      onSuccess: async (user) => {
        const next = await queryClient
          .fetchQuery({
            queryKey: planKeys.detail(id),
            queryFn: () => getPlan(id),
          })
          .catch(() => null);
        // Не нашёлся, уже закрыт или ты в нём — экран покажет это сам.
        if (
          !next ||
          next.plan.participantIds.includes(user.id) ||
          next.plan.status === "results" ||
          next.plan.status === "decided"
        ) {
          return;
        }
        requireName.run(() => join.mutate());
      },
    });

  if (!meId) {
    return (
      <GuestInvite
        title="Тебя зовут в план: вместе выбрать, чем заняться."
        loading={createUser.isPending}
        failed={createUser.isError}
        onJoin={joinAsNew}
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
    return <ContentSkeleton />;
  }

  const owner = view.participants.find(
    (person) => person.id === view.plan.ownerId,
  );
  const closed =
    view.plan.status === "results" || view.plan.status === "decided";

  return (
    <div className="flex h-full flex-col">
      {requireName.sheet}
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
            {", "}
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
            onClick={() => requireName.run(() => join.mutate())}
          >
            Вступить
          </Button>
        )}
      </div>
    </div>
  );
};

// Приглашение в план по ссылке (TECH_SPEC §8): без таб-бара.
const Frame = ({ children }: { children: ReactNode }) => (
  <Screen>
    <div className="flex h-[52px] flex-none items-center px-5">
      <Link
        href={ROUTES.HOME}
        aria-label="SwipeIt"
        className="inline-flex min-h-11 items-center"
      >
        <Brand size="sm" />
      </Link>
    </div>
    <ScreenBody>{children}</ScreenBody>
  </Screen>
);

export const PlanJoinPage = () => (
  <Frame>
    <Suspense fallback={<ContentSkeleton />}>
      <JoinContent />
    </Suspense>
  </Frame>
);

// Тот же экран до запуска вкладки (app/route-skeleton.tsx): шапка и скелетон
// вместо логотипа после прелоадера (DESIGN.md §6 «Прелоадер»).
export const PlanJoinPageSkeleton = () => (
  <Frame>
    <ContentSkeleton />
  </Frame>
);
