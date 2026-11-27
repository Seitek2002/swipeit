import type { Activity } from "../catalog/types";
import { getTransport } from "../transport";
import type {
  CreatePlanInput,
  CustomActivityInput,
  PlanFilters,
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
