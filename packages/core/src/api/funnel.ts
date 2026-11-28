import { z } from "zod";

// Шаги воронки, которые видит только клиент (auto-tasks-pm-3 R09): какой
// кнопкой делятся, где открывают, какие ошибки человек видел. Белый список:
// неизвестный шаг — VALIDATION.
export const CLIENT_FUNNEL_STEPS = [
  "share_channel_system",
  "share_channel_copy",
  "share_channel_qr",
  "in_app_browser_seen",
  "pwa_standalone",
  "session_expired_seen",
  "offline_seen",
  "rate_limited_seen",
] as const;

export type ClientFunnelStep = (typeof CLIENT_FUNNEL_STEPS)[number];

export const ClientFunnelInputSchema = z.object({
  step: z.enum(CLIENT_FUNNEL_STEPS, { error: "Такого шага нет" }),
});
