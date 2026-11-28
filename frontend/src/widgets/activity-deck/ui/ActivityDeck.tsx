"use client";

import { useRef, useState } from "react";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";

import { useQueryClient } from "@tanstack/react-query";
import { UserPlus, X } from "lucide-react";

import { LeavePlanButton } from "@/features/leave-plan";
import {
  SwipeDeck,
  type SwipeDeckHandle,
  type SwipeDirection,
} from "@/features/swipe-deck";

import {
  type Activity,
  ActivityTicket,
  formatPerPerson,
} from "@/entities/activity";
import { type PlanView, computeMatches } from "@/entities/plan";

import { isApiError, planKeys, swipePlan, undoPlanSwipe } from "@/shared/api";
import { ROUTES } from "@/shared/config";
import { withBasePath } from "@/shared/lib/base-path";
import { clock } from "@/shared/lib/clock";
import { usePreloadImages } from "@/shared/lib/image-cache";
import { useConnectionStatus } from "@/shared/lib/realtime";
import { cn } from "@/shared/lib/utils";
import {
  BottomSheet,
  Countdown,
  IconButton,
  buttonClassName,
  toast,
} from "@/shared/ui";

import { type Lagging, PLAN_INVITE_PARAM, deckStatus } from "../model";
import { DeckEnd } from "./DeckEnd";
import { InviteSheet } from "./InviteSheet";
import { ProgressRings } from "./ProgressRings";

type Props = { meId: string; view: PlanView };

const DIRECTIONS = ["left", "right"] as const;

// Подпись билета для экранного диктора (DESIGN.md §10): название и цена,
// как на самом билете — «… сом на человека» или «бесплатно».
const ticketLabel = (activity: Activity) => {
  const price = formatPerPerson(activity);
  return activity.pricePerPersonMax > 0
    ? `${activity.title}, ${price} на человека`
    : `${activity.title}, ${price.toLowerCase()}`;
};

// Колода билетиков плана (DESIGN.md §8.7 «Свайп»): шапка с «Выйти» и
// счётчиком совпадений, участники с кольцами прогресса, колода в общем для
// всех порядке — только влево и вправо, «Вернуть» последнюю карточку.
export const ActivityDeck = ({ view, meId }: Props) => {
  const queryClient = useQueryClient();
  const { plan, participants, activities } = view;
  const router = useRouter();
  const [exitOpen, setExitOpen] = useState(false);
  const isDeadline = plan.mode === "deadline";
  const inviteOnOpen = useSearchParams()?.get(PLAN_INVITE_PARAM) === "1";
  const [inviteOpen, setInviteOpen] = useState(
    () => isDeadline && inviteOnOpen,
  );
  // Закрыл шторку — убираем ?invite=1, чтобы она не открылась снова после
  // перезагрузки или «назад».
  const closeInvite = () => {
    setInviteOpen(false);
    if (inviteOnOpen) router.replace(ROUTES.PLAN_SESSION(plan.id));
  };
  const deckRef = useRef<SwipeDeckHandle>(null);
  const offline = useConnectionStatus() === "offline";

  // Очередь — локальное состояние стола (TECH_SPEC §9): берём то, что я
  // ещё не свайпнул, один раз; обновления плана её не перетасовывают.
  const [queue, setQueue] = useState<Activity[]>(() => {
    const mine = plan.swipes[meId] ?? {};
    return activities.filter((activity) => !mine[activity.id]);
  });
  const [history, setHistory] = useState<
    Array<{ activity: Activity; direction: SwipeDirection }>
  >([]);

  // Запросы строго по очереди: «Вернуть» не обгонит сам свайп.
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  // Фото верхнего и двух следующих билетиков — заранее (UX-аудит M4), тем
  // же кешем, что колода подарков.
  usePreloadImages(
    "tickets",
    queue
      .slice(0, 3)
      .flatMap((activity) =>
        activity.image ? [withBasePath(activity.image.src)] : [],
      ),
  );

  function enqueue<T>(task: () => Promise<T>) {
    const run = chain.current.then(task);
    chain.current = run.catch(() => undefined);
    return run;
  }
  const refresh = () =>
    void queryClient.invalidateQueries({ queryKey: planKeys.detail(plan.id) });

  const handleDecision = (activity: Activity, direction: SwipeDirection) => {
    setQueue((current) => current.filter((item) => item.id !== activity.id));
    setHistory((current) => [...current, { activity, direction }]);
    enqueue(() =>
      swipePlan(plan.id, activity.id, direction === "right" ? "like" : "pass"),
    ).then(refresh, (error: unknown) => {
      // Сервер отказал по делу (время вышло, план уже у итогов) — карточку
      // не возвращаем, а перечитываем план: экран сам перейдёт дальше.
      if (isApiError(error) && error.code === "CONFLICT") {
        toast(error.message, { tone: "info" });
        refresh();
        return;
      }
      toast("Не получилось сохранить. Карточка вернулась", { tone: "error" });
      setQueue((current) => [activity, ...current]);
      setHistory((current) =>
        current.filter((entry) => entry.activity.id !== activity.id),
      );
    });
  };

  const handleUndo = () => {
    const last = history[history.length - 1];
    if (!last) return null;
    setHistory((current) => current.slice(0, -1));
    setQueue((current) => [last.activity, ...current]);
    enqueue(() => undoPlanSwipe(plan.id, last.activity.id)).then(
      refresh,
      (error: unknown) => {
        // Сервер свайп не отменил — убираем карточку обратно, иначе экран и
        // сервер разошлись бы (а повторный свайп тихо заменил бы прежний).
        toast(isApiError(error) ? error.message : "Не получилось вернуть", {
          tone: "error",
        });
        setQueue((current) =>
          current.filter((item) => item.id !== last.activity.id),
        );
        setHistory((current) => [...current, last]);
        refresh();
      },
    );
    return { key: last.activity.id, direction: last.direction };
  };

  // Прогресс и совпадения — по доступной колоде, как считает сервер: занятие
  // могло пропасть из каталога после обновления.
  const available = new Set(activities.map((activity) => activity.id));
  const total = available.size;
  const done = Object.fromEntries(
    participants.map((person) => [
      person.id,
      Object.keys(plan.swipes[person.id] ?? {}).filter((id) =>
        available.has(id),
      ).length,
    ]),
  );
  const matches = computeMatches(plan, activities).matches.length;
  // Счётчик «7 из 20» под названием (X05): номер карточки наверху колоды;
  // колода кончилась — «20 из 20».
  const position = Math.min(total - queue.length + 1, total);
  const others = participants.filter((person) => person.id !== meId);
  // Кто ещё листает и сколько ему осталось — для «Напомнить» (X06); у кого
  // 0 карточек — план ещё не открывали (Y08).
  const swiping = others.flatMap((person): Array<Lagging & { id: string }> => {
    const count = done[person.id] ?? 0;
    const left = total - count;
    return left > 0
      ? [{ id: person.id, name: person.name, left, started: count > 0 }]
      : [];
  });
  const status = deckStatus(others.length, swiping, queue.length === 0);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 flex-none items-center gap-2 pr-4 pl-2">
        {plan.ownerId === meId ? (
          <Link
            href={ROUTES.PLANS}
            aria-label="Выйти"
            className="grid size-11 place-items-center rounded-full"
          >
            <X aria-hidden size={22} strokeWidth={1.75} />
          </Link>
        ) : (
          // Участник у крестика выбирает: просто к планам или выйти из
          // плана совсем (auto-tasks-pm-2 Q04). Организатору — только назад:
          // план держится на нём.
          <button
            type="button"
            aria-label="Выйти"
            onClick={() => setExitOpen(true)}
            className="grid size-11 place-items-center rounded-full"
          >
            <X aria-hidden size={22} strokeWidth={1.75} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <p className="text-title-3 truncate">{plan.title}</p>
          {/* Отсчёт и счётчик не обрезаются (Y08): в «До даты» — короткая
              форма «2 дн 6 ч · 10 из 12», счётчик не сжимается. Если места
              всё равно мало, сокращается подпись режима, а не числа. */}
          <p className="text-caption text-rose flex items-center gap-1 overflow-hidden whitespace-nowrap">
            {isDeadline && plan.deadline ? (
              // «До даты» (DESIGN.md §8.7): свайпают, когда удобно; итоги —
              // по дедлайну или когда закончат все.
              <Countdown
                to={plan.deadline}
                now={clock.now}
                short
                className="text-caption text-rose flex-none"
              />
            ) : (
              <>
                <i
                  aria-hidden
                  className="bg-mint mr-0.5 size-2 flex-none rounded-full shadow-[0_0_0_4px_rgb(143_227_198/0.18)]"
                />
                <span className="min-w-0 truncate">Прямо сейчас</span>
              </>
            )}
            {total > 0 && (
              <>
                <span aria-hidden className="flex-none">
                  ·
                </span>
                <span className="flex-none tabular-nums">
                  {position} из {total}
                </span>
              </>
            )}
          </p>
        </div>
        <span
          aria-live="polite"
          className={cn(
            "bg-velvet-2 border-line rounded-chip inline-flex h-8 items-center border px-3 text-[13px] leading-none font-semibold whitespace-nowrap",
          )}
        >
          Совпадений: {matches}
        </span>
      </header>
      <div className="flex flex-none items-center gap-3 px-5 pt-1 pb-2.5">
        <ProgressRings participants={participants} done={done} total={total} />
        <p className="text-caption text-rose min-w-0 flex-1">{status}</p>
        {isDeadline && (
          // «Позвать» (Y01): в «До даты» друзей больше негде позвать — ни
          // лобби, ни уведомлений. Рядом с кольцами участников: в первой
          // строке шапки на 360 px места нет.
          <IconButton
            label="Позвать друзей"
            onClick={() => setInviteOpen(true)}
            className="bg-velvet-2 border-line -mr-1 border"
          >
            <UserPlus aria-hidden size={20} strokeWidth={1.75} />
          </IconButton>
        )}
      </div>
      <SwipeDeck
        handleRef={deckRef}
        items={queue}
        directions={DIRECTIONS}
        getKey={(activity) => activity.id}
        getLabel={ticketLabel}
        renderCard={(activity) => <ActivityTicket activity={activity} fill />}
        onDecision={handleDecision}
        onUndo={handleUndo}
        canUndo={history.length > 0}
        disabled={offline}
        topInset={8}
        stampTop={34}
        announce={(activity, direction) =>
          direction === "right"
            ? `Хочу: ${activity.title}`
            : `Мимо: ${activity.title}`
        }
        empty={<DeckEnd view={view} meId={meId} swiping={swiping} />}
      />
      <BottomSheet
        open={exitOpen}
        onClose={() => setExitOpen(false)}
        title={plan.title}
      >
        <div className="flex flex-col gap-2">
          <Link
            href={ROUTES.PLANS}
            className={buttonClassName({ variant: "secondary", size: "lg" })}
          >
            К списку планов
          </Link>
          <p className="text-caption text-rose px-1 text-center">
            Свайпы сохранятся — вернёшься и продолжишь
          </p>
          <LeavePlanButton planId={plan.id} title={plan.title} size="md" />
        </div>
      </BottomSheet>
      {isDeadline && (
        <InviteSheet open={inviteOpen} onClose={closeInvite} view={view} />
      )}
    </div>
  );
};
