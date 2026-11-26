import { type KeyboardEvent, type RefObject, useEffect } from "react";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

const getFocusables = (root: HTMLElement) =>
  Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    (el) => !el.hasAttribute("inert") && el.getClientRects().length > 0,
  );

// Ловушка фокуса для шторок и диалогов (DESIGN.md §7 BottomSheet; в imbir её
// не было — анти-паттерн A14). При открытии фокус уходит внутрь, Tab не
// выпускает его наружу, при закрытии фокус возвращается на кнопку-открывашку.
//
// Возвращает обработчик onKeyDown для контейнера: Tab по кругу, Escape →
// onEscape. Escape ловим на контейнере, а не на document: фокус всегда внутри
// верхней шторки, поэтому при двух открытых закрывается только верхняя.
export function useFocusTrap(
  ref: RefObject<HTMLElement | null>,
  active: boolean,
  onEscape?: () => void,
) {
  useEffect(() => {
    if (!active) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    // Ждём кадр: содержимое портала и анимация входа уже в DOM.
    const raf = requestAnimationFrame(() => {
      const root = ref.current;
      if (!root || root.contains(document.activeElement)) return;
      // [data-autofocus] — вместо autoFocus: тот срабатывает раньше эффекта,
      // и кнопка-открывашка запомнилась бы неправильно.
      const preferred = root.querySelector<HTMLElement>("[data-autofocus]");
      const first = preferred ?? getFocusables(root)[0];
      (first ?? root).focus({ preventScroll: true });
    });
    return () => {
      cancelAnimationFrame(raf);
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
    };
  }, [active, ref]);

  return (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Escape" && onEscape) {
      event.stopPropagation();
      onEscape();
      return;
    }
    if (event.key !== "Tab") return;
    const root = ref.current;
    if (!root) return;
    const items = getFocusables(root);
    if (items.length === 0) {
      event.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first?.focus();
    }
  };
}
