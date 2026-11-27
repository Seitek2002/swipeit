import { useDemoSettingsStore } from "@/shared/store";

// Часы демо (TECH_SPEC §7 «Часы»): clock.now() = Date.now() + смещение.
// Смещение — «Перемотать на 1 день» из демо-панели. Все дедлайны, обратные
// отсчёты, автожеребьёвка и ближайшие дни рождения считаются только от него.
//
// serverDiffMs — разница с часами LAN-сервера (T12b): в режиме lan главные
// часы на ноутбуке, телефоны подстраиваются под них.
let serverDiffMs = 0;

export const setServerClockDiff = (diffMs: number) => {
  serverDiffMs = diffMs;
};

export const clock = {
  now: (): number =>
    Date.now() +
    serverDiffMs +
    useDemoSettingsStore.getState().settings.clockOffsetMs,
  // То же, но со смещением из аргумента. Для рендера: смещение берут из
  // стора хуком и передают сюда — иначе React Compiler закэширует clock.now()
  // (у вызова нет реактивных зависимостей), и «Перемотать» не обновит экран.
  at: (offsetMs: number): number => Date.now() + serverDiffMs + offsetMs,
};
