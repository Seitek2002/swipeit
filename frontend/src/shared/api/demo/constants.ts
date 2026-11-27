import type { DemoSettings } from "./types";

// Отдельно от схемы zod (см. catalog/constants.ts).
export const DEFAULT_DEMO_SETTINGS: DemoSettings = {
  botSpeed: "normal",
  noDelays: false,
  randomErrors: false,
  clockOffsetMs: 0,
};
