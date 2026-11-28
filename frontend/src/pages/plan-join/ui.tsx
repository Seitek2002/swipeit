"use client";

import { type ReactNode, Suspense, useEffect } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import {
  NAME_CAPTIONS,
  NamesakeNote,
  findNamesake,
  useRequireName,
} from "@/features/ask-name";

import { usePlan } from "@/entities/plan";
import { type User, useCreateUser, useMe } from "@/entities/user";

import {
  getPlan,
  isApiError,
  joinPlan,
  planKeys,
  userKeys,
} from "@/shared/api";
import { REMOTE_COPY, ROUTES } from "@/shared/config";
import { useAppMode } from "@/shared/lib/app-status";
import { useInviteCode } from "@/shared/lib/dom";
import { pluralize } from "@/shared/lib/format";
import { inAppJoinText } from "@/shared/lib/in-app-browser";
import { useSessionStore } from "@/shared/store";
import {
  AvatarStack,
  Brand,
  Button,
  ContentSkeleton,
  EmptyState,
  IN_APP_JOIN_NOTE_KEY,
  InAppBrowserNote,
  Screen,
  ScreenBody,
  buttonClassName,
  toast,
} from "@/shared/ui";

// План по ссылке не найден. В local он живёт в браузере, где его создали
// (TECH_SPEC §8): на другом устройстве id не найдётся — объясняем и
// предлагаем демо. В lan и remote план общий, и NOT_FOUND значит другое:
// его удалили или ссылка неполная (auto-tasks-pm-3 R07) — без демо-друзей.
const NotHere = ({ demo }: { demo: boolean }) => (
  <EmptyState
    className="h-full"
    object="ticket"
    title={
      demo
        ? "План открыт на другом телефоне. В демо его видно только на телефоне, где его создали, или в режиме «Локальная сеть»."
        : REMOTE_COPY.planNotFound
    }
    action={
      // Главное, что пригодится другу на любом телефоне, — свой вишлист
      // (в Санте его увидит его Санта); потом — посмотреть, как играют
      // демо-друзья (UX-аудит W01).
      <div className="flex flex-col gap-2">
        <Link href={ROUTES.GIFTS} className={buttonClassName({})}>
          {REMOTE_COPY.buildOwnWishlist}
        </Link>
        {demo && (
          <Link
            href={ROUTES.PLAN_CREATE}
            className={buttonClassName({ variant: "secondary" })}
          >
            Собрать план с демо-друзьями
          </Link>
        )}
      </div>
    }
  />
);

// Сбой связи при открытии приглашения — повтор той же кнопкой.
const LoadFailed = ({ onRetry }: { onRetry: () => void }) => (
  <EmptyState
    className="h-full"
    title="Не получилось открыть приглашение. Проверь связь и попробуй ещё раз."
    action={
      <Button variant="secondary" onClick={onRetry}>
        Попробовать ещё раз
      </Button>
    }
  />
);

// Экраны приглашений событий не получают (BACKEND.md §5): кто ещё вступил,
// видно по перечитыванию раз в 30 секунд.
const INVITE_REFETCH_MS = 30_000;

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
  const params = useSearchParams();
  const id = params?.get("id") ?? "";
  // Короткая ссылка remote: ?s=<код> вместо id — сначала узнаём у сервера,
  // какой это план (BACKEND.md §6.2).
  const code = id ? "" : (params?.get("s") ?? "");
  const invite = useInviteCode(code);
  const meId = useSessionStore((state) => state.activeUserId);
  const mode = useAppMode();
  // Без профиля в lan и remote план отдают превью (X07): гость видит, куда
  // его зовут, ещё до «Вступить». В local его здесь нет вовсе (ниже).
  const guestPreview = mode === "lan" || mode === "remote";
  const plan = usePlan(meId || guestPreview ? id : undefined, {
    guest: guestPreview,
    refetchInterval: mode === "remote" ? INVITE_REFETCH_MS : undefined,
  });
  const view = plan.data;
  const me = useMe();
  const isMember = Boolean(
    view && meId && view.plan.participantIds.includes(meId),
  );

  useEffect(() => {
    if (isMember) router.replace(ROUTES.PLAN_SESSION(id));
  }, [isMember, id, router]);

  // Тёзка среди участников (R04) — подпись под «Вступить».
  const namesakeOf = (name: string | undefined) =>
    view && name ? findNamesake(view.participants, name, meId) : undefined;
  const namesake = namesakeOf(me.data?.name);

  // Нет имени — NameSheet «Так тебя увидят в плане» по «Вступить» (DESIGN.md
  // §8.7), потом вступление само; NAME_REQUIRED от сервера — та же шторка.
  const requireName = useRequireName(NAME_CAPTIONS.plan);
  // Имя только что вписали в NameSheet, и оно совпало с участником, —
  // вступление не продолжаем: сначала человек увидит подпись про тёзку и
  // решит сам (R04). Подпись уже была на экране — вступаем сразу.
  const joinUnlessNewNamesake = (captionShown: boolean) => () => {
    const name = queryClient.getQueryData<User>(userKeys.me())?.name;
    if (!captionShown && namesakeOf(name)) return;
    join.mutate();
  };
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
        requireName.run(joinUnlessNewNamesake(false));
      },
    });

  const demo = mode === "local";
  if (code) {
    if (invite.missing) return <NotHere demo={demo} />;
    if (invite.failed) return <LoadFailed onRetry={invite.retry} />;
    return <ContentSkeleton />;
  }
  // Без профиля в local плана на этом телефоне нет: его создатель здесь с
  // профилем, и сессия вкладки его подхватывает (shared/store/session.ts).
  // Значит, ссылку открыли на другом телефоне — говорим сразу, а не после
  // «Вступить» (UX-аудит X07).
  if (!meId && demo) return <NotHere demo />;
  if (!id || (isApiError(plan.error) && plan.error.code === "NOT_FOUND")) {
    return <NotHere demo={demo} />;
  }
  // Превью гостю не отдали (сервер без X07 ответил 401) или сбой связи —
  // приглашение без подробностей, профиль создастся по «Вступить».
  if (!meId && plan.isError) {
    return (
      <GuestInvite
        title="Тебя зовут в план: вместе выбрать, чем заняться."
        loading={createUser.isPending}
        failed={createUser.isError}
        onJoin={joinAsNew}
      />
    );
  }
  if (plan.isError) {
    return <LoadFailed onRetry={() => void plan.refetch()} />;
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
        {!closed && (
          // Встроенный браузер мессенджера (R04): вступишь здесь — из Chrome
          // потом откроется другой профиль, и человек вступит второй раз.
          // Один раз за сессию, как в Q08.
          <InAppBrowserNote
            tone="velvet"
            className="mt-4"
            sessionKey={IN_APP_JOIN_NOTE_KEY}
            text={(browser) => inAppJoinText(browser, "plan")}
          />
        )}
      </div>
      <div className="flex-none px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {closed ? (
          <p className="text-caption text-rose text-center">
            Этот план уже выбрал занятие — вступить нельзя.
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="w-full"
              loading={join.isPending || createUser.isPending}
              onClick={() =>
                meId
                  ? requireName.run(joinUnlessNewNamesake(Boolean(namesake)))
                  : joinAsNew()
              }
            >
              Вступить
            </Button>
            {createUser.isError && (
              <p role="alert" className="text-caption text-rose text-center">
                Не получилось. Проверь связь и попробуй ещё раз
              </p>
            )}
            {namesake && <NamesakeNote name={namesake.name} place="plan" />}
          </div>
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
