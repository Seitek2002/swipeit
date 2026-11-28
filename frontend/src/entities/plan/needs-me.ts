"use client";

import { useSyncExternalStore } from "react";

import type { PlanSession } from "@/shared/api";

// «Ждут тебя» в плане (auto-tasks-pm-2 Q09): уведомлений нет, а итоги «До
// даты» открываются по часам. Точка на табе «Планы» и статус билетика.
export type PlanNeed = "results" | "swipe" | "vote";

export const planNeedsMe = (
  plan: Pick<
    PlanSession,
    "finishedIds" | "participantIds" | "status" | "votes"
  >,
  meId: null | string,
  // Статус, в котором я последний раз открывал план на этом устройстве.
  seenStatus: null | string,
): null | PlanNeed => {
  if (!meId || !plan.participantIds.includes(meId)) return null;
  if (plan.status === "swiping" && !plan.finishedIds.includes(meId)) {
    return "swipe";
  }
  if (plan.status === "results") {
    // «Выбрать самим» идёт, как только кто-то проголосовал.
    const voting = Object.keys(plan.votes).length > 0;
    if (voting && !plan.votes[meId]) return "vote";
  }
  if (
    (plan.status === "results" || plan.status === "decided") &&
    seenStatus !== plan.status
  ) {
    return "results";
  }
  return null;
};

export const PLAN_NEED_LABELS: Record<PlanNeed, string> = {
  swipe: "Ждём тебя",
  vote: "Твой голос",
  results: "Итоги готовы",
};

// Отметка «видел план в этом статусе» — удобство одного устройства
// (localStorage). Хранилище может быть недоступно — тогда точка просто
// не гаснет до следующего статуса.
const key = (id: string) => `swipeit:plan-seen:${id}`;
const EVENT = "swipeit:plan-seen";

export const readPlanSeen = (id: string): null | string => {
  try {
    return window.localStorage.getItem(key(id));
  } catch {
    return null;
  }
};

export const markPlanSeen = (id: string, status: string) => {
  try {
    if (window.localStorage.getItem(key(id)) === status) return;
    window.localStorage.setItem(key(id), status);
  } catch {
    return;
  }
  window.dispatchEvent(new Event(EVENT));
};

// Перерисовать экран, когда отметка поменялась (в этой вкладке или другой).
const subscribe = (onChange: () => void) => {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
};
let version = 0;
const bump = () => {
  version += 1;
};
if (typeof window !== "undefined") {
  window.addEventListener(EVENT, bump);
  window.addEventListener("storage", bump);
}
export const usePlanSeenVersion = () =>
  useSyncExternalStore(
    subscribe,
    () => version,
    () => 0,
  );
