"use client";

import {
  useMutation,
  useMutationState,
  useQueryClient,
} from "@tanstack/react-query";

import { useMe } from "@/entities/user";

import { type MeResponse, updateMe, userKeys } from "@/shared/api";
import { toast } from "@/shared/ui";

import {
  type TasteAction,
  type TasteState,
  applyTasteAction,
  tastePatch,
  tasteStateOf,
} from "./model";

const TASTE_MUTATION_KEY = ["taste-edit"] as const;

// Правки «Мне нравится» оптимистичны (TASKS T23): чип переезжает сразу, а не
// после ответа. Вид = данные сервера из кэша + ещё не завершённые тапы поверх
// (useMutationState). Неудачный тап просто выпадает из «ждущих», и чип сам
// возвращается на место; соседние тапы при этом не откатываются — в отличие
// от снимка кэша в onMutate, который затёр бы и их.
export const useTasteEdit = () => {
  const queryClient = useQueryClient();
  const { data: me } = useMe();

  const mutation = useMutation({
    mutationKey: TASTE_MUTATION_KEY,
    // Один за другим: PATCH шлёт списки целиком, и каждый следующий
    // собирается из ответа предыдущего, а не из устаревших данных.
    scope: { id: "taste-edit" },
    mutationFn: async (action: TasteAction) => {
      // Запрос /me, начатый до PATCH, вернул бы старый профиль поверх нового.
      await queryClient.cancelQueries({ queryKey: userKeys.me() });
      const current = queryClient.getQueryData<MeResponse>(userKeys.me());
      if (!current) throw new Error("Профиль ещё не загружен");
      return updateMe(tastePatch(tasteStateOf(current), action));
    },
    onSuccess: (next) => {
      // Ответ PATCH — уже MeResponse с пересчитанными догадками.
      queryClient.setQueryData(userKeys.me(), next);
    },
    onError: () => {
      toast("Не получилось сохранить. Попробуй ещё раз", { tone: "error" });
      // Отменённый выше запрос /me мог не вернуться — сверяемся с сервером.
      void queryClient.invalidateQueries({ queryKey: userKeys.me() });
    },
  });

  const pending = useMutationState({
    filters: { mutationKey: TASTE_MUTATION_KEY, status: "pending" },
    select: (item) => item.state.variables as TasteAction,
  });

  const state: TasteState | undefined = me
    ? pending.reduce(applyTasteAction, tasteStateOf(me))
    : undefined;

  return {
    apply: (action: TasteAction) => mutation.mutate(action),
    // Пока нет ни одного «Хочу», догадок быть не может — вместо них подпись.
    hasLikes: (me?.taste?.likes ?? 0) > 0,
    state,
  };
};
