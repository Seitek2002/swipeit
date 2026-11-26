import { useSyncExternalStore } from "react";

export type ToastTone = "error" | "info" | "loading" | "success";

export type ToastAction = { label: string; onClick: () => void };

export type ToastItem = {
  action?: ToastAction;
  id: number;
  text: string;
  tone: ToastTone;
};

type ToastOptions = {
  action?: ToastAction;
  // null — без автозакрытия («Нет связи с ноутбуком…», DESIGN.md §8.11).
  duration?: null | number;
  tone?: ToastTone;
};

// DESIGN.md §7 Toast: 2.5 секунды. С кнопкой «Отменить» — подольше, чтобы
// успеть нажать.
const DEFAULT_DURATION = 2500;
const ACTION_DURATION = 5000;

// Один тост за раз: новый заменяет текущий (как в reference.html). Стор —
// модульный, чтобы toast() звался откуда угодно, в том числе из колбэков
// мутаций, без хуков.
let current: null | ToastItem = null;
let nextId = 1;
let timer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

const emit = () => listeners.forEach((listener) => listener());

const dismiss = (id?: number) => {
  if (!current || (id !== undefined && current.id !== id)) return;
  current = null;
  clearTimeout(timer);
  emit();
};

export const toast = Object.assign(
  (text: string, options: ToastOptions = {}): number => {
    const id = nextId++;
    current = {
      id,
      text,
      tone: options.tone ?? "success",
      action: options.action,
    };
    clearTimeout(timer);
    const duration =
      options.duration === undefined
        ? options.action
          ? ACTION_DURATION
          : DEFAULT_DURATION
        : options.duration;
    if (duration !== null) timer = setTimeout(() => dismiss(id), duration);
    emit();
    return id;
  },
  { dismiss },
);

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const useCurrentToast = () =>
  useSyncExternalStore(
    subscribe,
    () => current,
    () => null,
  );
