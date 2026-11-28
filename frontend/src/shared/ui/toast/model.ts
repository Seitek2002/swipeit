import { useSyncExternalStore } from "react";

import { splitErrorCode } from "@/shared/api/error-code";

export type ToastTone = "error" | "info" | "loading" | "success";

export type ToastAction = { label: string; onClick: () => void };

export type ToastItem = {
  action?: ToastAction;
  // Ниже на столько px: тост не должен закрывать главный ориентир экрана
  // (лента «Ещё N — и можно отправить» в колоде, DESIGN.md §6).
  below?: number;
  id: number;
  // Вторая кнопка после action: «Перенесено в „Подарили“» — «Отменить» и
  // «Сказать спасибо» (T28).
  secondAction?: ToastAction;
  text: string;
  tone: ToastTone;
};

type ToastOptions = {
  action?: ToastAction;
  below?: number;
  // null — без автозакрытия («Нет связи с ноутбуком…», DESIGN.md §8.11).
  duration?: null | number;
  secondAction?: ToastAction;
  tone?: ToastTone;
};

// DESIGN.md §7 Toast: 2.5 секунды. С кнопкой «Отменить» — подольше, чтобы
// успеть нажать.
const DEFAULT_DURATION = 2500;
const ACTION_DURATION = 5000;
// Ошибка с кодом (S08) — чтобы успеть нажать на код и скопировать его.
const ERROR_CODE_DURATION = 6000;

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
      secondAction: options.action ? options.secondAction : undefined,
      below: options.below,
    };
    clearTimeout(timer);
    const duration =
      options.duration === undefined
        ? options.action
          ? ACTION_DURATION
          : splitErrorCode(text).code
            ? ERROR_CODE_DURATION
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
