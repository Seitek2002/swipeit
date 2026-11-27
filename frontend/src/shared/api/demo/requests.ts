import { getTransport } from "../transport";
import type { MeResponse, Reminder, User } from "../users/types";
import type { DemoSettings, NewYearScenarioResult } from "./types";

export const resetDemo = (): Promise<{ ok: true }> =>
  getTransport().request<{ ok: true }>("POST", "/demo/reset");

// Сценарий «Новый год» (TASKS T19): база заново, и всё для показа — от
// имени Айгерим. Работает и без сессии (новое устройство).
export const loadNewYearScenario = (): Promise<NewYearScenarioResult> =>
  getTransport().request<NewYearScenarioResult>(
    "POST",
    "/demo/scenario/new-year",
  );

export const getDemoSettings = (): Promise<DemoSettings> =>
  getTransport().request<DemoSettings>("GET", "/demo/settings");

export const updateDemoSettings = (
  patch: Partial<DemoSettings>,
): Promise<DemoSettings> =>
  getTransport().request<DemoSettings>("PATCH", "/demo/settings", patch);

export const getDemoUsers = (): Promise<User[]> =>
  getTransport().request<User[]>("GET", "/demo/users");

// «Показать обучение снова»: снять отметки deck_guide и taste_toast у
// текущего профиля — обучающая карточка снова первая.
export const resetDemoHints = (): Promise<MeResponse> =>
  getTransport().request<MeResponse>("POST", "/demo/hints/reset");

// «Перемотать к напоминанию»: часы встают за 30 дней до ближайшей своей
// даты, напоминание о которой не скрыто. Своих дат нет — VALIDATION
// «Сначала отправь вишлист с датой».
export const jumpToReminder = (): Promise<{
  clockOffsetMs: number;
  ok: true;
  reminder: null | Reminder;
}> => getTransport().request("POST", "/demo/clock/to-reminder");
