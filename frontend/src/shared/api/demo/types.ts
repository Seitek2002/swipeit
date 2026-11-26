import { z } from "zod";

// Настройки демо, которые влияют на «сервер» (TECH_SPEC §6–7). В режиме local
// они свои у вкладки, в lan — общие для всех телефонов сети.
export const DemoSettingsSchema = z.object({
  botSpeed: z.enum(["slow", "normal", "fast", "off"]),
  // «Без задержек» — мок-API отвечает сразу, без 150–450 ms.
  noDelays: z.boolean(),
  // «Случайные ошибки 10%» — показать состояния ошибок.
  randomErrors: z.boolean(),
  // Смещение часов: «Перемотать на 1 день» прибавляет 24 часа.
  clockOffsetMs: z.number(),
});

export type DemoSettings = z.infer<typeof DemoSettingsSchema>;

export const DEFAULT_DEMO_SETTINGS: DemoSettings = {
  botSpeed: "normal",
  noDelays: false,
  randomErrors: false,
  clockOffsetMs: 0,
};
