import { useSyncExternalStore } from "react";

import type { ApiMode } from "@/shared/api";

// Готовность вкладки (TECH_SPEC §6): пока app/environment.ts не определил
// режим, не выбрал транспорт, не поднял шину и не прочитал сессию, в API
// ходить нельзя — в lan запрос ушёл бы в мок, а не на ноутбук.
//
// Раньше до готовности весь экран заменяла заставка, и в статическом HTML
// не было ничего, кроме банта: первый осмысленный кадр появлялся только
// после загрузки и гидратации всего JS (LCP ~3,5 с на телефоне). Теперь
// экраны без данных (приветствие онбординга, «Авторы фото») рисуются сразу,
// уже в HTML, а запросы, мутации и подписчики шины ждут этого флага.
export type AppStatus =
  | { mode: ApiMode; status: "ready" }
  | { status: "failed" }
  | { status: "loading" };

const LOADING: AppStatus = { status: "loading" };

let current: AppStatus = LOADING;
const listeners = new Set<() => void>();

// Зовёт только app/environment после запуска (или его сбоя).
export const setAppStatus = (next: AppStatus) => {
  current = next;
  listeners.forEach((listener) => listener());
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// На сервере (статическая сборка) и при гидратации — всегда «загрузка»:
// HTML один на оба режима, и разметка гидратации с ним совпадает.
export const useAppStatus = (): AppStatus =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => LOADING,
  );

export const useAppReady = (): boolean => useAppStatus().status === "ready";

// Режим после запуска, до него — null. Хук, а не getMode() в рендере: у
// вызова без аргументов нет реактивных зависимостей, React Compiler закэширует
// его результат, и экран не узнал бы, что режим определился.
export const useAppMode = (): ApiMode | null => {
  const status = useAppStatus();
  return status.status === "ready" ? status.mode : null;
};
