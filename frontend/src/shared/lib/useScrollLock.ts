import { useEffect } from "react";

// Счётчик открытых блокирующих поверхностей (шторки, диалоги). В imbir
// useScrollLock писал прямо в body.style, и при двух открытых шторках
// закрытие верхней снимало блокировку у обеих (их анти-паттерн A13).
// Здесь блокировка снимается, только когда закрылась последняя.
let locks = 0;

const apply = () => {
  // Прокручиваются тела экранов (ScreenBody с data-scroll-root), а не
  // страница, — их и замораживаем через атрибут и правило в globals.css.
  if (locks > 0) document.documentElement.dataset.scrollLocked = "";
  else delete document.documentElement.dataset.scrollLocked;
};

export function useScrollLock(active: boolean) {
  useEffect(() => {
    if (!active) return;
    locks += 1;
    apply();
    return () => {
      locks -= 1;
      apply();
    };
  }, [active]);
}

// Для тестов и витрины: сколько сейчас блокировок.
export const getScrollLockCount = () => locks;
