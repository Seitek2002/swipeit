"use client";

import { Suspense, useEffect } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { santaTerms, useSantaGame } from "@/entities/santa-game";

import { isApiError, joinSantaGame, santaKeys } from "@/shared/api";
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

// В local игра живёт в браузере, где её создали (TECH_SPEC §8): на другом
// устройстве id не найдётся — объясняем и предлагаем свою игру.
const NotHere = () => (
  <EmptyState
    className="h-full"
    object="envelope"
    title="В демо-версии присоединиться можно только с этого же устройства (ссылка в новой вкладке) или через режим «Локальная сеть». А пока посмотри, как играют демо-друзья."
    action={
      <Link
        href={ROUTES.SANTA_CREATE}
        className={buttonClassName({ variant: "secondary" })}
      >
        Создать свою игру с демо-друзьями
      </Link>
    }
  />
);

const JoinContent = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = useSearchParams()?.get("id") ?? "";
  const meId = useSessionStore((state) => state.activeUserId);
  const game = useSantaGame(meId ? id : undefined);
  const view = game.data;
  const isMember = view?.role === "owner" || view?.role === "participant";

  useEffect(() => {
    if (isMember) router.replace(ROUTES.SANTA_GAME(id));
  }, [isMember, id, router]);

  const join = useMutation({
    mutationFn: () => joinSantaGame(id),
    onSuccess: (next) => {
      queryClient.setQueryData(santaKeys.detail(id), next);
      router.replace(ROUTES.SANTA_GAME(id));
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
        object="envelope"
        title="Тебя зовут в Тайного Санту. Сначала представься — это займёт минуту."
        action={
          <Button
            onClick={() => {
              setReturnTo(ROUTES.SANTA_JOIN(id));
              router.push(ROUTES.ONBOARDING);
            }}
          >
            Познакомиться
          </Button>
        }
      />
    );
  }
  if (!id || (isApiError(game.error) && game.error.code === "NOT_FOUND")) {
    return <NotHere />;
  }
  if (game.isError) {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось открыть приглашение. Проверь связь и попробуй ещё раз."
        action={
          <Button variant="secondary" onClick={() => void game.refetch()}>
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

  const owner = view.members.find((member) => member.id === view.game.ownerId);
  const joined = view.members.filter((member) => member.joined);
  const closed = view.game.status === "drawn";

  return (
    <div className="flex h-full flex-col">
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
          <Button
            size="lg"
            className="w-full"
            loading={join.isPending}
            onClick={() => join.mutate()}
          >
            Вступить в игру
          </Button>
        )}
      </div>
    </div>
  );
};

// Приглашение в Тайного Санту по ссылке (TECH_SPEC §8): без таб-бара.
export const SantaJoinPage = () => (
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
    <ScreenBody>
      <Suspense fallback={<Splash />}>
        <JoinContent />
      </Suspense>
    </ScreenBody>
  </Screen>
);
