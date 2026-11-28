import {
  CLIENT_FUNNEL_STEPS,
  type ClientFunnelStep,
} from "@swipeit/core/api/funnel";

import { getRemoteToken, useRemoteSessionStore } from "@/shared/store";

import { getMode } from "./mode";
import { getTransport } from "./transport";

export type { ClientFunnelStep };

// Шаги воронки, которые видит только клиент (auto-tasks-pm-3 R09): какой
// кнопкой делятся, где открывают, какие ошибки человек видел. Только remote:
// в local и lan воронки нет, транспорт не трогаем.
//
// Без ожидания и без повторов, ошибки молча глотаем: воронка не должна
// показывать тосты, экраны ошибок и «Сессия закончилась» (запрос quiet).
//
// Маршрут — только для профиля. Профиля ещё нет (первый заход по ссылке,
// встроенный браузер) или сессия закончилась — шаг ждёт в sessionStorage
// вкладки и уходит, когда профиль появится (flushFunnelSteps). Так
// «Где открывают» считается от profile_created, а «Сессия закончилась»
// доходит после «Начать заново» — со старым токеном сервер ответит 401.
const PENDING_KEY = "swipeit:remote:funnel-pending";

// Один шаг — один запрос на загрузку страницы: сервер всё равно считает
// шаг один раз на человека.
const sent = new Set<ClientFunnelStep>();
// Хранилище запрещено — ждущие шаги живут до перезагрузки вкладки.
let memoryPending: ClientFunnelStep[] = [];

const isStep = (value: unknown): value is ClientFunnelStep =>
  typeof value === "string" &&
  (CLIENT_FUNNEL_STEPS as readonly string[]).includes(value);

const readPending = (): ClientFunnelStep[] => {
  try {
    const raw = sessionStorage.getItem(PENDING_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? parsed.filter(isStep) : [];
  } catch {
    return memoryPending;
  }
};

const writePending = (steps: ClientFunnelStep[]) => {
  memoryPending = steps;
  try {
    if (steps.length)
      sessionStorage.setItem(PENDING_KEY, JSON.stringify(steps));
    else sessionStorage.removeItem(PENDING_KEY);
  } catch {
    // См. memoryPending.
  }
};

const hasSession = () =>
  Boolean(getRemoteToken()) && !useRemoteSessionStore.getState().expired;

const send = (step: ClientFunnelStep) => {
  sent.add(step);
  getTransport()
    .request("POST", "/me/funnel", { step }, undefined, { quiet: true })
    .catch(() => undefined);
};

export const trackStep = (step: ClientFunnelStep): void => {
  if (getMode() !== "remote" || sent.has(step)) return;
  if (hasSession()) {
    send(step);
    return;
  }
  const pending = readPending();
  if (!pending.includes(step)) writePending([...pending, step]);
};

// Профиль появился или сменился — отправить шаги, которые его ждали.
export const flushFunnelSteps = (): void => {
  if (getMode() !== "remote" || !hasSession()) return;
  const pending = readPending();
  if (!pending.length) return;
  writePending([]);
  pending.forEach((step) => {
    if (!sent.has(step)) send(step);
  });
};
