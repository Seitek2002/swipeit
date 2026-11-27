"use client";

import { useRef, useState } from "react";

import Link from "next/link";

import { useQueryClient } from "@tanstack/react-query";
import { X } from "lucide-react";

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
import { clock } from "@/shared/lib/clock";
import { useConnectionStatus } from "@/shared/lib/realtime";
import { cn } from "@/shared/lib/utils";
import { Countdown, EmptyState, toast } from "@/shared/ui";

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

const joinNames = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "")
    : `${names.slice(0, -1).join(", ")} и ${names[names.length - 1]}`;

// Колода билетиков плана (DESIGN.md §8.7 «Свайп»): шапка с «Выйти» и
// счётчиком совпадений, участники с кольцами прогресса, колода в общем для
// всех порядке — только влево и вправо, «Вернуть» последнюю карточку.
export const ActivityDeck = ({ view, meId }: Props) => {
  const queryClient = useQueryClient();
  const { plan, participants, activities } = view;
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
  const others = participants.filter((person) => person.id !== meId);
  const swiping = others.filter((person) => (done[person.id] ?? 0) < total);
  const status =
    others.length === 0
      ? "Ты листаешь один"
      : swiping.length === 0
        ? "Остальные уже всё пролистали"
        : `${joinNames(swiping.map((person) => person.name))} ${swiping.length === 1 ? "листает" : "листают"} вместе с тобой`;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-14 flex-none items-center gap-2 pr-4 pl-2">
        <Link
          href={ROUTES.PLANS}
          aria-label="Выйти"
          className="grid size-11 place-items-center rounded-full"
        >
          <X aria-hidden size={22} strokeWidth={1.75} />
        </Link>
        <div className="min-w-0 flex-1">
          <p className="text-title-3 truncate">{plan.title}</p>
          {plan.mode === "deadline" && plan.deadline ? (
            // «До даты» (DESIGN.md §8.7): свайпают, когда удобно; итоги — по
            // дедлайну или когда закончат все.
            <Countdown
              to={plan.deadline}
              now={clock.now}
              className="text-caption text-rose"
            />
          ) : (
            <p className="text-caption text-rose flex items-center gap-1.5">
              <i
                aria-hidden
                className="bg-mint size-2 rounded-full shadow-[0_0_0_4px_rgb(143_227_198/0.18)]"
              />
              Прямо сейчас
            </p>
          )}
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
        <p className="text-caption text-rose min-w-0">{status}</p>
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
        empty={
          <EmptyState
            object="ticket"
            title="Колода закончилась. Ждём остальных — итоги откроются, когда закончат все."
          />
        }
      />
    </div>
  );
};
