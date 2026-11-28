"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import type { WishlistItem, WishlistResponse } from "@/entities/wishlist";

import {
  deleteWishlistItem,
  markWishlistItemGiven,
  reorderWishlist,
  restoreWishlistItem,
  undeleteWishlistItem,
  updateWishlistItem,
  wishlistKeys,
} from "@/shared/api";
import { deleteCustomImage } from "@/shared/lib/dom";
import { toast } from "@/shared/ui";

type Patch = Parameters<typeof updateWishlistItem>[1];

// Оптимистичное обновление вишлиста по полному циклу (как в imbir,
// CODESTYLE §10): onMutate меняет кэш сразу → onError откатывает →
// onSettled перечитывает с «сервера». Реакция на действие — мгновенно.
const useOptimistic = () => {
  const queryClient = useQueryClient();
  const key = wishlistKeys.mine();

  const apply = async (
    change: (data: WishlistResponse) => WishlistResponse,
  ) => {
    await queryClient.cancelQueries({ queryKey: key });
    const previous = queryClient.getQueryData<WishlistResponse>(key);
    if (previous) queryClient.setQueryData(key, change(previous));
    return { previous };
  };

  const rollback = (context?: { previous?: WishlistResponse }) => {
    if (context?.previous) queryClient.setQueryData(key, context.previous);
  };

  const settle = () =>
    queryClient.invalidateQueries({ queryKey: wishlistKeys.all });

  return { apply, rollback, settle };
};

const mapItem = (
  data: WishlistResponse,
  id: string,
  change: (item: WishlistItem) => WishlistItem,
): WishlistResponse => ({
  ...data,
  items: data.items.map((item) => (item.id === id ? change(item) : item)),
});

export const useUpdateItem = () => {
  const { apply, rollback, settle } = useOptimistic();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Patch }) =>
      updateWishlistItem(id, patch),
    onMutate: ({ id, patch }) =>
      apply((data) =>
        mapItem(data, id, (item) => ({
          ...item,
          ...patch,
          note:
            patch.note === undefined
              ? item.note
              : patch.note.trim() || undefined,
        })),
      ),
    onError: (_error, _input, context) => {
      rollback(context);
      toast("Не получилось сохранить. Попробуй ещё раз", { tone: "error" });
    },
    onSettled: settle,
  });
};

// Новый ручной порядок: ids — все желания в нужном порядке.
export const useReorder = () => {
  const { apply, rollback, settle } = useOptimistic();
  return useMutation({
    mutationFn: reorderWishlist,
    onMutate: (ids: string[]) =>
      apply((data) => {
        const position = new Map(ids.map((id, index) => [id, index]));
        return {
          ...data,
          items: data.items
            .map((item) => ({
              ...item,
              order: position.get(item.id) ?? item.order,
            }))
            .sort((a, b) => a.order - b.order),
        };
      }),
    onError: (_error, _ids, context) => {
      rollback(context);
      toast("Не получилось поменять порядок", { tone: "error" });
    },
    onSettled: settle,
  });
};

// Удаление с «Отменить» в тосте (TASKS T08): желание возвращается на то же
// место с тем же вариантом и заметкой.
const IMAGE_CLEANUP_MS = 6000;

export const useDeleteItem = () => {
  const { apply, rollback, settle } = useOptimistic();
  return useMutation({
    mutationFn: (item: WishlistItem) => deleteWishlistItem(item.id),
    onMutate: (item) =>
      apply((data) => ({
        ...data,
        items: data.items.filter((entry) => entry.id !== item.id),
      })),
    onSuccess: (removed) => {
      // Фото своего желания удаляем, когда «Отменить» уже не нажать: тост с
      // действием живёт 5 с (или его сменил другой тост).
      const imageKey =
        removed.source.kind === "custom"
          ? removed.source.custom.imageKey
          : undefined;
      const cleanup = imageKey
        ? setTimeout(
            () => void deleteCustomImage(imageKey).catch(() => undefined),
            IMAGE_CLEANUP_MS,
          )
        : undefined;
      toast("Желание удалено", {
        action: {
          label: "Отменить",
          onClick: () => {
            clearTimeout(cleanup);
            undeleteWishlistItem(removed)
              .then(() => settle())
              .catch(() => toast("Не получилось вернуть", { tone: "error" }));
          },
        },
      });
    },
    onError: (_error, _item, context) => {
      rollback(context);
      toast("Не получилось удалить", { tone: "error" });
    },
    onSettled: settle,
  });
};

// «Мне это подарили» (DESIGN.md §8.3): тост «Перенесено в „Подарили“» с
// «Отменить» — желание встаёт на прежнее место, закрытые брони снова открыты.
// Даритель указан — вторая кнопка «Сказать спасибо» (T28): момент для
// спасибо — сразу, а не потом в меню ⋮. onThanks — в переменных мутации:
// шторка к ответу сервера уже закрыта, а её пропсы — пусты.
export const useMarkGiven = () => {
  const { apply, rollback, settle } = useOptimistic();
  return useMutation({
    mutationFn: ({
      id,
      given,
    }: {
      given: { at: string; fromName?: string; fromUserId?: string };
      id: string;
      onThanks?: (item: WishlistItem) => void;
    }) => markWishlistItemGiven(id, given),
    onMutate: ({ id, given }) =>
      apply((data) =>
        mapItem(data, id, (item) => ({ ...item, status: "given", given })),
      ),
    onSuccess: (item, { onThanks }) =>
      toast("Перенесено в «Подарили»", {
        action: {
          label: "Отменить",
          onClick: () => {
            restoreWishlistItem(item.id, { undo: true })
              .then(() => settle())
              .catch(() => toast("Не получилось вернуть", { tone: "error" }));
          },
        },
        secondAction:
          onThanks && item.given?.fromName
            ? { label: "Сказать спасибо", onClick: () => onThanks(item) }
            : undefined,
      }),
    onError: (_error, _input, context) => {
      rollback(context);
      toast("Не получилось перенести", { tone: "error" });
    },
    onSettled: settle,
  });
};

// «Вернуть в вишлист» из вкладки «Подарили» — в начало списка, как новое
// желание (новые — первыми; номер как у сервера: на единицу меньше верхнего).
export const useRestoreItem = () => {
  const { apply, rollback, settle } = useOptimistic();
  return useMutation({
    mutationFn: (id: string) => restoreWishlistItem(id),
    onMutate: (id) =>
      apply((data) => {
        const first = Math.min(1, ...data.items.map((item) => item.order)) - 1;
        return mapItem(data, id, (item) => ({
          ...item,
          status: "active",
          given: undefined,
          order: first,
        }));
      }),
    onSuccess: () => toast("Вернулось в вишлист"),
    onError: (_error, _id, context) => {
      rollback(context);
      toast("Не получилось вернуть", { tone: "error" });
    },
    onSettled: settle,
  });
};
