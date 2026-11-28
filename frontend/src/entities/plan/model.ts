import {
  type PlanMatches,
  type PlanParticipant,
  type PlanSession,
  type PlanSummary,
  type PlanView,
  isTimedOutWithoutResults,
} from "@/shared/api";
import { formatDayMonth } from "@/shared/lib/format";

// computeMatches — чистая функция (TECH_SPEC §6). Живёт в shared/api: её же
// зовёт мок-сервер, чтобы разослать plan:match, а ему нельзя импортировать
// entities (FSD). Для интерфейса — отсюда.
export {
  computeMatches,
  countedParticipants,
  decisionCandidates,
  isTimedOutWithoutResults,
  tallyVotes,
  voteCandidates,
} from "@/shared/api";

export type {
  PlanMatches,
  PlanParticipant,
  PlanSession,
  PlanSummary,
  PlanView,
};

const time = (iso: string) =>
  new Date(iso).toLocaleTimeString("ru", {
    hour: "2-digit",
    minute: "2-digit",
  });

// «До 28 ноября, 20:00».
export const formatDeadline = (iso: string) =>
  `До ${formatDayMonth(iso)}, ${time(iso)}`;

export type PlanStatusView = { live: boolean; text: string };

// Статус в списке планов (DESIGN.md §8.7): «Идёт сейчас» — мятой точкой,
// «До 28 ноября, 20:00», «Решено: Кино».
export const planStatus = (
  plan: PlanSession,
  decisionTitle?: string,
): PlanStatusView => {
  if (plan.status === "decided") {
    return { live: false, text: `Решено: ${decisionTitle ?? "…"}` };
  }
  // Дата закрыла план, а долистал меньше двоих (Y02): итогов нет.
  if (isTimedOutWithoutResults(plan)) {
    return { live: false, text: "Время вышло" };
  }
  if (plan.status === "results") return { live: false, text: "Итоги готовы" };
  if (plan.mode === "deadline" && plan.deadline) {
    return { live: false, text: formatDeadline(plan.deadline) };
  }
  if (plan.status === "lobby") {
    return { live: false, text: "Ждём участников" };
  }
  return { live: true, text: "Идёт сейчас" };
};
