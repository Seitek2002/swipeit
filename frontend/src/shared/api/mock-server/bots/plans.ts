import type { BotBehavior } from "./engine";

// Боты в «Че делать будем?» (TECH_SPEC §7): в лобби жмут «Готов», после
// старта свайпают колоду в своём темпе, в режиме «До даты» — в случайные
// моменты до дедлайна. Сценарии — в T14; здесь хуки, к которым они
// подключатся.
export const plansBehavior: BotBehavior = {
  "plan:created": () => undefined,
  "plan:started": () => undefined,
};
