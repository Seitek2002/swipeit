import type { MeResponse, UpdateMeInput } from "@/shared/api";
import { INTEREST_IDS, type InterestId } from "@/shared/config";

// Что блок «Мне нравится» знает о вкусе (DESIGN.md §8.9): свои интересы,
// «Не моё» и выведенные сервером из лайков.
export type TasteState = {
  inferredInterests: string[];
  interests: string[];
  mutedInterests: string[];
};

// add — подтвердить догадку или выбрать из «Все интересы», remove — снять
// свой, mute — «Не моё».
export type TasteAction = {
  id: InterestId;
  type: "add" | "mute" | "remove";
};

const KNOWN: ReadonlySet<string> = new Set(INTEREST_IDS);
const isKnown = (id: string): id is InterestId => KNOWN.has(id);

const without = (list: readonly string[], id: string) =>
  list.filter((item) => item !== id);
const withItem = (list: readonly string[], id: string) =>
  list.includes(id) ? [...list] : [...list, id];

export const tasteStateOf = (me: MeResponse): TasteState => ({
  interests: me.interests,
  mutedInterests: me.mutedInterests ?? [],
  inferredInterests: me.inferredInterests,
});

// Повторяет то, что сделает PATCH /me (handlers/users.ts): новое решение
// снимает старое — свой интерес не бывает «Не моё» и наоборот. Догадку,
// которую человек решил, больше не предлагаем. Снятый свой интерес сервер
// может снова предложить по лайкам — это узнаем из его ответа, здесь не гадаем.
export const applyTasteAction = (
  state: TasteState,
  action: TasteAction,
): TasteState => {
  const { id } = action;
  switch (action.type) {
    case "add":
      return {
        interests: withItem(state.interests, id),
        mutedInterests: without(state.mutedInterests, id),
        inferredInterests: without(state.inferredInterests, id),
      };
    case "remove":
      return { ...state, interests: without(state.interests, id) };
    case "mute":
      return {
        interests: without(state.interests, id),
        mutedInterests: withItem(state.mutedInterests, id),
        inferredInterests: without(state.inferredInterests, id),
      };
  }
};

// Тело PATCH /me для действия. Списки целиком (так устроен контракт), только
// из 20 известных id — иначе сервер ответит VALIDATION. Второй список не
// шлём: сервер сам снимет интерес оттуда, а оба сразу с одним id — ошибка.
export const tastePatch = (
  state: TasteState,
  action: TasteAction,
): UpdateMeInput => {
  const next = applyTasteAction(state, action);
  return action.type === "mute"
    ? { mutedInterests: next.mutedInterests.filter(isKnown) }
    : { interests: next.interests.filter(isKnown) };
};

export type TasteGroups = {
  // Догадки по лайкам: чип с Sparkles и X.
  inferred: InterestId[];
  // Выбраны самим человеком: «Бумага» с Check.
  own: InterestId[];
  // Остальные из 20 — под «Все интересы». «Не моё» тоже здесь: передумал —
  // выбрал сам.
  rest: InterestId[];
};

// Раскладка чипов по группам. Сервер уже убирает из inferredInterests свои и
// «Не моё», но при оптимистичном обновлении списки расходятся на мгновение —
// поэтому чип никогда не попадает в две группы сразу.
export const tasteGroups = (state: TasteState): TasteGroups => {
  const own = [...new Set(state.interests.filter(isKnown))];
  const muted = new Set(state.mutedInterests);
  const inferred = [
    ...new Set(
      state.inferredInterests
        .filter(isKnown)
        .filter((id) => !own.includes(id) && !muted.has(id)),
    ),
  ];
  const rest = INTEREST_IDS.filter(
    (id) => !own.includes(id) && !inferred.includes(id),
  );
  return { own, inferred, rest };
};
