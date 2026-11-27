import { useEffect, useSyncExternalStore } from "react";

import { type ImageCache, type ImageStatus, createImageCache } from "./cache";

export type { ImageStatus } from "./cache";
export { type PlanCard, preloadPlan } from "./plan";

let cache: ImageCache | null = null;

const getCache = (): ImageCache | null => {
  if (typeof window === "undefined") return null;
  cache ??= createImageCache({
    createImage: () => new Image(),
    setTimer: (callback, ms) => window.setTimeout(callback, ms),
    clearTimer: (id) => window.clearTimeout(id as number),
  });
  return cache;
};

const subscribe = (listener: () => void) =>
  getCache()?.subscribe(listener) ?? (() => undefined);

// Состояние картинки в кеше. На сервере (сборка) — «idle».
export const useImageStatus = (src: string | undefined): ImageStatus =>
  useSyncExternalStore(
    subscribe,
    () => getCache()?.getStatus(src) ?? "idle",
    () => "idle",
  );

// Фото открыто на экране: грузить вне очереди, пока открыто. active=false —
// только смотреть на состояние (карточка под верхней грузится по окну).
export const useShownImage = (src: string | undefined, active = true) => {
  const status = useImageStatus(src);
  useEffect(() => {
    if (!src || !active) return;
    return getCache()?.show(src);
  }, [src, active]);
  return status;
};

// Окно предзагрузки группы (колода, шторка «Подробнее»). Ключ — сам список,
// чтобы новый массив с теми же URL не пересобирал очередь.
export const usePreloadImages = (
  group: string,
  srcs: readonly string[],
  kept?: readonly string[],
) => {
  const key = srcs.join("\n");
  const keptKey = kept?.join("\n");
  // Смена окна — без промежуточной очистки: иначе каждый свайп обрывал бы
  // загрузки, которые остались в окне. Группа уходит только с экраном.
  useEffect(() => {
    getCache()?.setGroup(group, key ? key.split("\n") : []);
  }, [group, key]);
  useEffect(() => () => getCache()?.setGroup(group, []), [group]);
  useEffect(() => {
    if (keptKey === undefined) return;
    getCache()?.setKept(keptKey ? keptKey.split("\n") : []);
  }, [keptKey]);
};

export const retryImage = (src: string) => getCache()?.retry(src);

// Картинки, которые статический HTML уже начал качать (<link rel="preload"
// as="image">: обложка обучающей карточки, TECH_SPEC §6). Кеш берёт их сразу
// при старте JS и декодирует заранее — к первому кадру ленты карточка уже с
// фото, без перелива и банта. Адрес — тот же, что у <img> в GiftPhoto.
export const warmPreloadedImages = () => {
  if (typeof document === "undefined") return;
  const srcs = [
    ...document.querySelectorAll<HTMLLinkElement>(
      'link[rel="preload"][as="image"]',
    ),
  ]
    .map((link) => link.getAttribute("href"))
    .filter((href): href is string => Boolean(href));
  if (srcs.length > 0) getCache()?.setGroup("html-preload", srcs);
};
