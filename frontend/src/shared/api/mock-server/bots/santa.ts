import type { BotBehavior } from "./engine";

// Боты в Тайном Санте (TECH_SPEC §7): вступают через 2–10 с, собирают
// вишлист, после жеребьёвки вскрывают конверты и отмечают «Купил».
// Сценарии — в T17; здесь хуки, к которым они подключатся.
export const santaBehavior: BotBehavior = {
  "santa:created": () => undefined,
  "santa:drawn": () => undefined,
};
