import { Brand } from "../brand";

// Заставка с бантом (TECH_SPEC §6): пока приложение решает, куда вести —
// в онбординг или в ленту — и определяет режим. Не дольше доли секунды.
export const Splash = () => (
  <div
    role="status"
    aria-label="Загрузка"
    className="flex h-full items-center justify-center"
  >
    <Brand size="md" />
  </div>
);
