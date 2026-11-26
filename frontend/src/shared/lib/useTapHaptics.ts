import { useEffect } from "react";

import { vibrate } from "./haptics";

// Перенесено из imbir: лёгкая вибрация при тапе по кнопке или ссылке — то
// ощущение «родного» приложения, которого не хватает сайту. Работает только
// там, где есть Vibration API (см. haptics.ts).
export const useTapHaptics = () => {
  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      const target = (event.target as HTMLElement | null)?.closest?.(
        'button, a, [role="button"]',
      );
      if (!target) return;
      if (
        target.hasAttribute("disabled") ||
        target.getAttribute("aria-disabled") === "true"
      ) {
        return;
      }
      vibrate(10);
    };

    document.addEventListener("click", handleClick);
    return () => document.removeEventListener("click", handleClick);
  }, []);
};
