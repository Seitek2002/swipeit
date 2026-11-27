"use client";

import { Suspense, useEffect } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Gift } from "lucide-react";

import { AppHeader } from "@/widgets/app-header";
import { SantaEnvelope } from "@/widgets/santa-envelope";

import { SantaDrawButton } from "@/features/santa-draw";

import {
  type SantaView,
  drawLabel,
  santaTerms,
  useSantaGame,
} from "@/entities/santa-game";

import {
  isApiError,
  joinSantaGame,
  openSantaEnvelope,
  santaKeys,
  setSantaBought,
} from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { absoluteUrl } from "@/shared/lib/dom";
import { pluralize } from "@/shared/lib/format";
import { cn } from "@/shared/lib/utils";
import { useSessionStore } from "@/shared/store";
import {
  Avatar,
  Button,
  EmptyState,
  Screen,
  ScreenBody,
  ShareActions,
  Skeleton,
  Splash,
  buttonClassName,
  toast,
} from "@/shared/ui";

import { WardWishlist } from "./WardWishlist";

// Участники со статусами (DESIGN.md §8.8): «вишлист готов» мятной галочкой,
// «без вишлиста» пыльной розой; у себя — «Собрать вишлист».
const Members = ({ view, meId }: { meId: string; view: SantaView }) => {
  const joined = view.members.filter((member) => member.joined);
  const invited = view.members.filter((member) => !member.joined);
  return (
    <section>
      <h2 className="text-label mb-1">
        Участники <span className="text-rose">{joined.length}</span>
      </h2>
      <ul>
        {[...joined, ...invited].map((member) => (
          <li
            key={member.id}
            className="border-line flex min-h-[56px] items-center gap-3 border-b"
          >
            <Avatar
              name={member.name}
              color={member.avatarColor}
              size={36}
              decorative
            />
            <span className="text-body text-paper flex-1 font-semibold">
              {member.id === meId ? "Ты" : member.name}
            </span>
            {!member.joined ? (
              <span className="text-caption text-rose">ещё не вступил(а)</span>
            ) : member.hasWishlist ? (
              <span className="text-caption text-mint inline-flex items-center gap-1">
                <Check aria-hidden size={16} strokeWidth={2.25} />
                вишлист готов
              </span>
            ) : member.id === meId ? (
              <Link
                href={ROUTES.GIFTS}
                className={buttonClassName({
                  size: "sm",
                  variant: "secondary",
                })}
              >
                Собрать вишлист
              </Link>
            ) : (
              <span className="text-caption text-rose">без вишлиста</span>
            )}
          </li>
        ))}
      </ul>
      {view.game.status === "drawn" && (
        <p className="text-caption text-rose mt-3 inline-flex items-center gap-1.5">
          <Gift aria-hidden size={16} strokeWidth={1.75} />
          Подарок купили: {view.boughtCount} из {joined.length}
        </p>
      )}
    </section>
  );
};

const GameContent = () => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = useSearchParams()?.get("id") ?? undefined;
  const meId = useSessionStore((state) => state.activeUserId);
  const game = useSantaGame(id);
  const view = game.data;

  // Чужой по ссылке — на экран приглашения.
  useEffect(() => {
    if (id && view?.role === "guest") router.replace(ROUTES.SANTA_JOIN(id));
  }, [id, view?.role, router]);

  const save = (next: SantaView) => {
    queryClient.setQueryData(santaKeys.detail(id ?? ""), next);
    void queryClient.invalidateQueries({ queryKey: santaKeys.list() });
  };
  const open = useMutation({
    mutationFn: () => openSantaEnvelope(id ?? ""),
    onSuccess: save,
    onError: () => toast("Не получилось открыть письмо", { tone: "error" }),
  });
  const bought = useMutation({
    mutationFn: () => setSantaBought(id ?? "", true),
    onSuccess: (next) => {
      save(next);
      toast("Отмечено: подарок куплен");
    },
    onError: () => toast("Не получилось сохранить", { tone: "error" }),
  });
  const join = useMutation({
    mutationFn: () => joinSantaGame(id ?? ""),
    onSuccess: (next) =>
      queryClient.setQueryData(santaKeys.detail(id ?? ""), next),
    onError: (error) =>
      toast(isApiError(error) ? error.message : "Не получилось вступить", {
        tone: "error",
      }),
  });

  if (!id || (isApiError(game.error) && game.error.code === "NOT_FOUND")) {
    return (
      <EmptyState
        className="h-full"
        object="envelope"
        title="Такой игры нет."
      />
    );
  }
  if (game.isError) {
    return (
      <EmptyState
        className="h-full"
        title="Не получилось загрузить игру. Проверь связь и попробуй ещё раз."
        action={
          <Button variant="secondary" onClick={() => void game.refetch()}>
            Попробовать ещё раз
          </Button>
        }
      />
    );
  }
  if (!view || !meId || view.role === "guest") {
    return (
      <div className="flex flex-col gap-4 pt-2">
        <Skeleton className="h-8 w-2/3" />
        <Skeleton tone="paper" className="h-52 rounded-[22px]" />
      </div>
    );
  }

  const isOwner = view.role === "owner";
  const withoutWishlist = view.members.filter(
    (member) => member.joined && !member.hasWishlist,
  );
  const envelope = view.me?.envelope ?? "sealed";
  // Подопечный приходит сразу после жеребьёвки, но показываем только во
  // вскрытом конверте — анимация не ждёт сети.
  const ward = envelope === "opened" ? (view.me?.ward ?? null) : null;

  return (
    <div className="flex flex-col gap-5 pb-6">
      <div>
        <p className="text-title-2">{view.game.title}</p>
        <p className="text-caption text-rose mt-0.5">{santaTerms(view.game)}</p>
      </div>
      <SantaEnvelope
        state={envelope}
        onOpen={() => open.mutate()}
        letter={
          ward && (
            <>
              <p className="text-caption text-ink-soft">Ты Тайный Санта для</p>
              <p className="text-display mt-1 italic">{ward.name}</p>
              <p className="text-caption text-ink-soft mt-1.5">
                Вишлист:{" "}
                {pluralize(ward.wishlist.length, [
                  "желание",
                  "желания",
                  "желаний",
                ])}
                , {ward.wishlist.length - ward.overBudgetCount} в бюджете
              </p>
            </>
          )
        }
      />
      <div className="-mt-2 flex flex-col items-center gap-3 text-center">
        {view.game.status === "gathering" && (
          <>
            <p className="text-title-3">{drawLabel(view.game)}</p>
            {isOwner && <SantaDrawButton view={view} />}
            {view.role === "invited" ? (
              <Button
                size="lg"
                loading={join.isPending}
                onClick={() => join.mutate()}
              >
                Вступить в игру
              </Button>
            ) : (
              view.drawIssue && (
                <p className="text-caption text-rose">{view.drawIssue}</p>
              )
            )}
          </>
        )}
        {envelope === "ready" && (
          <>
            <p className="text-caption text-rose">
              Удерживай печать, чтобы открыть
            </p>
            <Button
              size="lg"
              variant="ghost"
              loading={open.isPending}
              onClick={() => open.mutate()}
            >
              Открыть письмо
            </Button>
          </>
        )}
        {view.game.status === "drawn" && !view.me && (
          <p className="text-caption text-rose">
            Жеребьёвка прошла без тебя — в этой игре ты не участвуешь.
          </p>
        )}
      </div>

      {envelope === "opened" && ward && (
        <>
          <WardWishlist items={ward.wishlist} name={ward.name} />
          {view.me?.bought ? (
            <p className="text-caption text-mint inline-flex items-center justify-center gap-1.5">
              <Check aria-hidden size={16} strokeWidth={2.25} />
              Подарок куплен
            </p>
          ) : (
            <Button
              size="lg"
              variant="secondary"
              loading={bought.isPending}
              onClick={() => bought.mutate()}
            >
              Я купил подарок
            </Button>
          )}
        </>
      )}

      <Members view={view} meId={meId} />

      {view.game.status === "gathering" && (
        <section className="flex flex-col gap-3">
          {isOwner && withoutWishlist.length > 0 && (
            <Button
              variant="secondary"
              onClick={() =>
                toast(
                  `Напомнили: ${withoutWishlist.map((member) => member.name).join(", ")}`,
                )
              }
            >
              Напомнить тем, кто без вишлиста
            </Button>
          )}
          <p className="text-label">Позвать по ссылке</p>
          <ShareActions
            getPayload={async () => ({
              title: view.game.title,
              text: `Тайный Санта «${view.game.title}»: ${santaTerms(view.game)} Вступай!`,
              url: absoluteUrl(ROUTES.SANTA_JOIN(view.game.id)),
            })}
            qrLabel="QR-код приглашения в игру"
          />
        </section>
      )}
    </div>
  );
};

// Экран игры Тайного Санты (DESIGN.md §8.8): конверт — главный объект,
// ниже участники со статусами вишлиста.
export const SantaGamePage = () => (
  <Screen>
    <AppHeader title="Тайный Санта" showBack backHref={ROUTES.SANTA} />
    <ScreenBody className={cn("px-5 pt-2")}>
      <Suspense fallback={<Splash />}>
        <GameContent />
      </Suspense>
    </ScreenBody>
  </Screen>
);
