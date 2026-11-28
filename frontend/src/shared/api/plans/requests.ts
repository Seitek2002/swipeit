import type { Activity } from "../catalog/types";
import { getTransport } from "../transport";
import type {
  CreatePlanInput,
  CustomActivityInput,
  DecidePlanInput,
  PlanFilters,
  PlanSession,
  PlanSummary,
  PlanView,
} from "./types";

const planPath = (id: string) => `/plans/${encodeURIComponent(id)}`;

export const getPlans = (): Promise<PlanSummary[]> =>
  getTransport().request<PlanSummary[]>("GET", "/plans");

export const getPlan = (id: string): Promise<PlanView> =>
  getTransport().request<PlanView>("GET", planPath(id));

export const createPlan = (input: CreatePlanInput): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", "/plans", input);

export const joinPlan = (id: string): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/join`);

export const setPlanReady = (id: string, ready = true): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/ready`, { ready });

export const startPlan = (id: string): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/start`);

// Решение по карточке колоды; повторный свайп той же карточки заменяет его.
export const swipePlan = (
  id: string,
  activityId: string,
  decision: "like" | "pass",
): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/swipes`, {
    activityId,
    decision,
  });

// «Вернуть карточку» — отменить свой свайп этого занятия.
export const undoPlanSwipe = (
  id: string,
  activityId: string,
): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/swipes/undo`, {
    activityId,
  });

// Участник закончил колоду. Последний свайп отмечает это и сам — вызов
// нужен, когда часть карточек недоступна.
export const finishPlan = (id: string): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/finish`);

// Занятия каталога; с фильтрами — те, что попадут в колоду плана.
export const getActivities = (filters?: PlanFilters): Promise<Activity[]> =>
  getTransport().request<Activity[]>(
    "GET",
    "/activities",
    undefined,
    filters ? { filters: JSON.stringify(filters) } : undefined,
  );

export const createCustomActivity = (
  input: CustomActivityInput,
): Promise<Activity> =>
  getTransport().request<Activity>("POST", "/activities", input);

// ── Результаты и решение (T15) ──

// Голос в «Выбрать самим»; null — снять свой голос.
export const votePlan = (
  id: string,
  activityId: null | string,
): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/votes`, {
    activityId,
  });

// Решение организатора. У барабана итог выбирает сервер — экран узнаёт его
// из ответа и только потом крутит анимацию.
// «Показать итоги сейчас» — организатор, не дожидаясь всех (P04).
export const closePlan = (id: string): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/close`);

// «Выйти из плана» — участник, не организатор (Q04).
export const leavePlan = (id: string): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/leave`);

export const decidePlan = (
  id: string,
  input: DecidePlanInput,
): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/decide`, input);

export const cancelPlanDecision = (id: string): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/decide/cancel`);

// «Считать по большинству» на экране «Совпадений нет».
export const setPlanRule = (
  id: string,
  matchRule: PlanSession["matchRule"],
): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/rule`, {
    matchRule,
  });

// «Добавить ещё занятий»: каталог или свои (createCustomActivity) — план
// снова в свайпе. deadline — новая дата для «До даты» (без неё, если
// прежняя прошла, сервер даёт ещё сутки).
export const addPlanActivities = (
  id: string,
  activityIds: string[],
  deadline?: string,
): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/activities`, {
    activityIds,
    deadline,
  });

// «Продлить на сутки»: план «До даты» закрыла дата, а долистал меньше
// двоих — новая дата через сутки, план снова в колоде (Y02).
export const extendPlan = (id: string): Promise<PlanView> =>
  getTransport().request<PlanView>("POST", `${planPath(id)}/extend`);

// Планировщик дедлайнов: закрыть планы «До даты», у которых наступила дата.
export const expirePlans = (): Promise<{ expired: string[] }> =>
  getTransport().request<{ expired: string[] }>("POST", "/plans/expire");
