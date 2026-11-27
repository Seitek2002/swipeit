import { useLayoutEffect, useSyncExternalStore } from "react";

import { PRELOADER_ID } from "./constants";
import {
  FADE_MS,
  type PreloaderController,
  createPreloaderController,
} from "./controller";

// Прелоадер — статический HTML из корневого layout (#app-preloader, DESIGN.md
// §6): он виден ещё до загрузки JS. Здесь — только решение, когда его убрать.

export { PRELOADER_ID } from "./constants";
// Разрешённая запись мимо мок-сервера (TASKS T21): прелоадер уже показывался.
const SEEN_KEY = "swipeit:preloader:seen";

const readSeen = () => {
  try {
    return window.localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};

let controller: null | PreloaderController = null;

// Прелоадер исчез — компонент в layout возвращает null. Узел убирает сам
// React, а не мы руками: при клиентском «Назад» корневой layout монтируется
// заново, и вставленный обратно прелоадер закрыл бы экран навсегда.
let done = false;
const doneListeners = new Set<() => void>();
const finish = () => {
  done = true;
  doneListeners.forEach((listener) => listener());
};

export const usePreloaderDone = (): boolean =>
  useSyncExternalStore(
    (listener) => {
      doneListeners.add(listener);
      return () => doneListeners.delete(listener);
    },
    () => done,
    () => false,
  );

const getController = (): null | PreloaderController => {
  if (typeof window === "undefined") return null;
  if (controller) return controller;
  controller = createPreloaderController({
    seenBefore: readSeen(),
    now: () => performance.now(),
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
    clearTimer: (id) => window.clearTimeout(id as number),
    markSeen: () => {
      try {
        window.localStorage.setItem(SEEN_KEY, "1");
      } catch {
        // Хранилище недоступно (приватный режим) — просто покажем
        // хореографию целиком и в следующий раз.
      }
    },
    removeNode: () => {
      // Исчезновение 300ms, потом узла нет.
      document.getElementById(PRELOADER_ID)?.setAttribute("data-hidden", "");
      window.setTimeout(finish, FADE_MS);
    },
  });
  return controller;
};

// Запуск часов прелоадера (предел 4s считается от начала загрузки страницы).
export const startPreloader = () => {
  getController();
};

export const isPreloaderHidden = () => getController()?.isHidden() ?? true;

// Приложение запустилось (или не смогло — ошибку тоже пора показать).
export const settlePreloaderApp = () => getController()?.appSettled();

export const holdPreloader = (key: string) => getController()?.hold(key);

export const releasePreloader = (key: string) => getController()?.release(key);

// Экран держит прелоадер, пока active: лента — до декодированного фото первой
// карточки, гостевой вишлист — до первого запроса. Layout-эффект: удержание
// нового экрана ставится в том же коммите, где старый своё снял.
export const usePreloaderHold = (key: string, active: boolean) => {
  useLayoutEffect(() => {
    if (!active) return;
    holdPreloader(key);
    return () => releasePreloader(key);
  }, [key, active]);
};
