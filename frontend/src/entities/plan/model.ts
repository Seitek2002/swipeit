import type {
  PlanParticipant,
  PlanSession,
  PlanSummary,
  PlanView,
} from "@/shared/api";
import { formatDayMonth } from "@/shared/lib/format";

export type { PlanParticipant, PlanSession, PlanSummary, PlanView };

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
  if (plan.status === "results") return { live: false, text: "Итоги готовы" };
  if (plan.mode === "deadline" && plan.deadline) {
    return { live: false, text: formatDeadline(plan.deadline) };
  }
  if (plan.status === "lobby") {
    return { live: false, text: "Ждём участников" };
  }
  return { live: true, text: "Идёт сейчас" };
};
