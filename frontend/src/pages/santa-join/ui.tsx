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

import { santaTerms, useSantaGame } from "@/entities/santa-game";
import { type User, useCreateUser, useMe } from "@/entities/user";

import {
  getSantaGame,
  isApiError,
  joinSantaGame,
  santaKeys,
  userKeys,
} from "@/shared/api";
import { REMOTE_COPY, ROUTES } from "@/shared/config";
import { useAppMode } from "@/shared/lib/app-status";
import { useInviteCode } from "@/shared/lib/dom";
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

// Игра по ссылке не найдена. В local она живёт в браузере, где её создали
// (TECH_SPEC §8): на другом устройстве id не найдётся — объясняем и
// предлагаем демо. В lan и remote игра общая, и NOT_FOUND значит другое:
// её удалили или ссылка неполная (auto-tasks-pm-3 R07) — без демо-друзей.
const NotHere = ({ demo }: { demo: boolean }) => (
  <EmptyState
    className="h-full"
    object="envelope"
    title={
      demo
        ? "Игра открыта на другом телефоне. В демо её видно только на телефоне, где её создали, или в режиме «Локальная сеть»."
        : REMOTE_COPY.santaNotFound
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
            href={ROUTES.SANTA_CREATE}
            className={buttonClassName({ variant: "secondary" })}
          >
            Посмотреть игру с демо-друзьями
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
    object="envelope"
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
  // какая это игра (BACKEND.md §6.2).
  const code = id ? "" : (params?.get("s") ?? "");
  const invite = useInviteCode(code);
  const meId = useSessionStore((state) => state.activeUserId);
  const mode = useAppMode();
  // Без профиля в lan и remote игру отдают превью с ролью guest (X07):
  // гость видит, куда его зовут, ещё до «Вступить». В local её здесь нет.
  const guestPreview = mode === "lan" || mode === "remote";
  const game = useSantaGame(meId || guestPreview ? id : undefined, {
    guest: guestPreview,
    refetchInterval: mode === "remote" ? INVITE_REFETCH_MS : undefined,
  });
  const view = game.data;
  const me = useMe();
  const isMember = view?.role === "owner" || view?.role === "participant";

  useEffect(() => {
    if (isMember) router.replace(ROUTES.SANTA_GAME(id));
  }, [isMember, id, router]);

  // Тёзка среди вступивших (R04): жеребьёвка дала бы одному человеку с
  // двух телефонов двух подопечных — подпись под «Вступить».
  const namesakeOf = (name: string | undefined) =>
    view && name
      ? findNamesake(
          view.members.filter((member) => member.joined),
          name,
          meId,
        )
      : undefined;
  const namesake = namesakeOf(me.data?.name);

  // Нет имени — NameSheet «Так тебя увидят в игре» по «Вступить» (DESIGN.md
  // §8.8), потом вступление само; NAME_REQUIRED от сервера — та же шторка.
  const requireName = useRequireName(NAME_CAPTIONS.santa);
  // Имя только что вписали в NameSheet, и оно совпало с участником, —
  // вступление не продолжаем: сначала человек увидит подпись про тёзку и
  // решит сам (R04). Подпись уже была на экране — вступаем сразу.
  const joinUnlessNewNamesake = (captionShown: boolean) => () => {
    const name = queryClient.getQueryData<User>(userKeys.me())?.name;
    if (!captionShown && namesakeOf(name)) return;
    join.mutate();
  };
  const join = useMutation({
    mutationFn: () => joinSantaGame(id),
    onSuccess: (next) => {
      queryClient.setQueryData(santaKeys.detail(id), next);
      router.replace(ROUTES.SANTA_GAME(id));
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

  // Без профиля «Вступить» создаёт его сам (TECH_SPEC §10). Игру читаем уже
  // от нового профиля: если вступить можно — NameSheet, потом вступление.
  const createUser = useCreateUser();
  const joinAsNew = () =>
    createUser.mutate(undefined, {
      onSuccess: async () => {
        const next = await queryClient
          .fetchQuery({
            queryKey: santaKeys.detail(id),
            queryFn: () => getSantaGame(id),
          })
          .catch(() => null);
        // Не нашлась, жеребьёвка прошла или ты уже в игре — экран покажет сам.
        if (
          !next ||
          next.role === "owner" ||
          next.role === "participant" ||
          next.game.status === "drawn"
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
  // Без профиля в local игры на этом телефоне нет: её создатель здесь с
  // профилем, и сессия вкладки его подхватывает (shared/store/session.ts).
  // Значит, ссылку открыли на другом телефоне — говорим сразу, а не после
  // «Вступить» (UX-аудит X07).
  if (!meId && demo) return <NotHere demo />;
  if (!id || (isApiError(game.error) && game.error.code === "NOT_FOUND")) {
    return <NotHere demo={demo} />;
  }
  // Превью гостю не отдали (сервер без X07 ответил 401) или сбой связи —
  // приглашение без подробностей, профиль создастся по «Вступить».
  if (!meId && game.isError) {
    return (
      <GuestInvite
        title="Тебя зовут в Тайного Санту: жеребьёвка решит, кто кому дарит."
        loading={createUser.isPending}
        failed={createUser.isError}
        onJoin={joinAsNew}
      />
    );
  }
  if (game.isError) {
    return <LoadFailed onRetry={() => void game.refetch()} />;
  }
  if (!view || isMember) {
    return <ContentSkeleton />;
  }

  const owner = view.members.find((member) => member.id === view.game.ownerId);
  const joined = view.members.filter((member) => member.joined);
  const closed = view.game.status === "drawn";

  return (
    <div className="flex h-full flex-col">
      {requireName.sheet}
      <div className="flex-1 px-5 pt-4">
        <p className="text-title-3 text-rose">
          {owner
            ? `${owner.name} зовёт в Тайного Санту`
            : "Тебя зовут в Тайного Санту"}
        </p>
        <h1 className="text-title-1 mt-1">{view.game.title}</h1>
        <p className="text-body text-paper mt-2">{santaTerms(view.game)}</p>
        <div className="paper rounded-paper shadow-paper mt-5 flex items-center gap-3 px-4 py-3.5">
          <AvatarStack
            people={joined.map((member) => ({
              id: member.id,
              name: member.name,
              color: member.avatarColor,
            }))}
            size={32}
            ring="paper"
          />
          <p className="text-caption text-ink-soft">
            {pluralize(joined.length, ["участник", "участника", "участников"])}{" "}
            уже в игре
          </p>
        </div>
        <p className="text-body text-rose mt-5">
          После жеребьёвки ты узнаешь, кому даришь, — и увидишь его вишлист в
          рамках бюджета. Кто дарит тебе, останется сюрпризом.
        </p>
      </div>
      <div className="flex-none px-5 pt-2 pb-[calc(env(safe-area-inset-bottom)+16px)]">
        {closed ? (
          <p className="text-caption text-rose text-center">
            Жеребьёвка уже прошла — вступить нельзя.
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
              Вступить в игру
            </Button>
            {createUser.isError && (
              <p role="alert" className="text-caption text-rose text-center">
                Не получилось. Проверь связь и попробуй ещё раз
              </p>
            )}
            {namesake && <NamesakeNote name={namesake.name} place="santa" />}
          </div>
        )}
      </div>
    </div>
  );
};

// Приглашение в Тайного Санту по ссылке (TECH_SPEC §8): без таб-бара.
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

export const SantaJoinPage = () => (
  <Frame>
    <Suspense fallback={<ContentSkeleton />}>
      <JoinContent />
    </Suspense>
  </Frame>
);

// Тот же экран до запуска вкладки (app/route-skeleton.tsx): шапка и скелетон
// вместо логотипа после прелоадера (DESIGN.md §6 «Прелоадер»).
export const SantaJoinPageSkeleton = () => (
  <Frame>
    <ContentSkeleton />
  </Frame>
);
