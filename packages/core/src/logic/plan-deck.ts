import type { Activity } from "../api/catalog/types";
import type { PlanSession } from "../api/plans/types";
import { createSeededRandom } from "./random";

// Короткая колода «Прямо сейчас» (auto-tasks-ux-4 X05): компания стоит
// вместе и решает за пару минут — 50 карточек это 2–3 минуты свайпа и
// «Совпало 13 из 50», из которых снова не выбрать. По умолчанию — 20.
export const QUICK_DECK_SIZE = 20;

// Сколько занятий берём в колоду: явное значение из запроса, иначе для
// «Прямо сейчас» — короткая колода, для «До даты» — все (как раньше).
// null — без ограничения.
export const resolveDeckSize = (
  mode: PlanSession["mode"],
  deckSize: null | number | undefined,
): null | number =>
  deckSize !== undefined ? deckSize : mode === "live" ? QUICK_DECK_SIZE : null;

// Сколько карточек будет в колоде: свои занятия — всегда (их добавили
// специально), каталог — до размера колоды.
export const plannedDeckSize = (
  customCount: number,
  catalogCount: number,
  deckSize: null | number,
): number => {
  const all = customCount + catalogCount;
  if (deckSize === null) return all;
  return Math.max(customCount, Math.min(all, deckSize));
};

// Занятия колоды из пула плана. Свои — всегда, каталог — поровну из разных
// категорий: по очереди по одному из каждой, пока не наберётся размер, —
// иначе в 20 из 50 могли бы попасть одни «Активные» (их в каталоге больше
// всех). Выбор детерминирован по seed (id плана): лобби показывает те же
// занятия, что окажутся в колоде, и у всех одни и те же. Порядок — как в
// пуле (свои, потом каталог); перемешивает колоду старт плана.
export const pickPlanDeck = (
  custom: readonly Activity[],
  catalog: readonly Activity[],
  deckSize: null | number,
  seed: string,
): Activity[] => {
  const room =
    deckSize === null ? catalog.length : Math.max(0, deckSize - custom.length);
  if (catalog.length <= room) return [...custom, ...catalog];

  const random = createSeededRandom(`plan-deck:${seed}`);
  const byCategory = new Map<string, Activity[]>();
  for (const activity of catalog) {
    byCategory.set(activity.category, [
      ...(byCategory.get(activity.category) ?? []),
      activity,
    ]);
  }
  const queues = random
    .shuffle([...byCategory.values()])
    .map((group) => random.shuffle(group));
  const chosen = new Set<string>();
  while (chosen.size < room) {
    for (const queue of queues) {
      const next = queue.shift();
      if (next) chosen.add(next.id);
      if (chosen.size >= room) break;
    }
  }
  return [...custom, ...catalog.filter((activity) => chosen.has(activity.id))];
};
