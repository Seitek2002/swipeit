import { useSyncExternalStore } from "react";

import { useDemoSettingsStore } from "@/shared/store";

// Часы демо (TECH_SPEC §7 «Часы»): clock.now() = Date.now() + смещение.
// Смещение — «Перемотать на 1 день» из демо-панели. Все дедлайны, обратные
// отсчёты, автожеребьёвка и ближайшие дни рождения считаются только от него.
//
// В local смещение хранится в настройках демо этого браузера. В lan главные
// часы — на ноутбуке: serverDiffMs — разница с его часами (из /health), а
// смещение перемотки общее для всех и приходит с сервера (T12b).
let serverDiffMs = 0;
let lanOffsetMs: null | number = null;
const listeners = new Set<() => void>();

// Режим lan: разница с часами сервера без перемотки и сама перемотка.
export const setLanClock = ({
  diffMs,
  offsetMs,
}: {
  diffMs: number;
  offsetMs: number;
}) => {
  serverDiffMs = diffMs;
  lanOffsetMs = offsetMs;
  listeners.forEach((listener) => listener());
};

const currentOffset = () =>
  lanOffsetMs ?? useDemoSettingsStore.getState().settings.clockOffsetMs;

export const clock = {
  now: (): number => Date.now() + serverDiffMs + currentOffset(),
  // То же, но со смещением из аргумента. Для рендера: смещение берут хуком
  // useClockOffset() и передают сюда — иначе React Compiler закэширует
  // clock.now() (у вызова нет реактивных зависимостей), и «Перемотать» не
  // обновит экран.
  at: (offsetMs: number): number => Date.now() + serverDiffMs + offsetMs,
};

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  const unsubscribe = useDemoSettingsStore.subscribe(listener);
  return () => {
    listeners.delete(listener);
    unsubscribe();
  };
};

// Текущее смещение часов демо — реактивно, в обоих режимах.
export const useClockOffset = () =>
  useSyncExternalStore(subscribe, currentOffset, () => 0);
