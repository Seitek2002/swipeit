"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useMe } from "@/entities/user";

import {
  type ReservationsView,
  createReservation,
  deleteReservation,
  getReservations,
  isApiError,
  isNameRequired,
  reservationKeys,
} from "@/shared/api";
import { useMounted } from "@/shared/lib/dom";
import { useGuestStore } from "@/shared/store";
import { toast } from "@/shared/ui";

// Кто бронирует: человек с профилем — от своего имени, гость по ссылке без
// профиля — по id из localStorage и имени, которое он назвал (DESIGN.md §8.5).
export const useReserver = () => {
  const { data: me } = useMe();
  const guestId = useGuestStore((state) => state.guestId);
  const guestName = useGuestStore((state) => state.name);
  // needsName — вопрос имени только для брони, у гостя без профиля. Профилю
  // без имени имя спросит NameSheet (features/ask-name) и сохранит в профиль.
  return me
    ? {
        name: me.name ?? "",
        guestId: undefined,
        isGuest: false,
        needsName: false,
      }
    : { name: guestName, guestId, isGuest: true, needsName: !guestName };
};

export type ReservationState = "closed" | "free" | "mine" | "taken";

export const useReservations = (ownerId: string) => {
  const mounted = useMounted();
  const { guestId } = useReserver();
  const query = useQuery({
    queryKey: reservationKeys.forOwner(ownerId),
    queryFn: () => getReservations(ownerId, guestId),
    enabled: mounted && Boolean(ownerId),
  });

  const view: ReservationsView | undefined = query.data;
  const items = view?.role === "guest" ? view.items : [];

  // Состояние желания: свободно, моё, занято кем-то, уже подарено. Закрытая
  // бронь показывается «Уже подарено» только тому, кто бронировал.
  const stateOf = (
    itemKey: string,
  ): { id?: string; state: ReservationState } => {
    const mine = items.find((item) => item.itemKey === itemKey && item.mine);
    if (mine) return { id: mine.id, state: mine.closed ? "closed" : "mine" };
    const taken = items.find(
      (item) => item.itemKey === itemKey && !item.closed,
    );
    return { state: taken ? "taken" : "free" };
  };

  return { ...query, stateOf };
};

export const useReserve = (ownerId: string) => {
  const queryClient = useQueryClient();
  const { guestId } = useReserver();
  return useMutation({
    mutationFn: ({ itemKey, name }: { itemKey: string; name?: string }) =>
      createReservation({ ownerId, itemKey, name, guestId }),
    onSuccess: () => toast("Подарок забронирован"),
    // NAME_REQUIRED разбирает ReserveControl: спрашивает имя и повторяет.
    onError: (error) => {
      if (isNameRequired(error)) return;
      toast(
        isApiError(error)
          ? error.message
          : "Не получилось забронировать. Попробуй ещё раз",
        { tone: "error" },
      );
    },
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: reservationKeys.forOwner(ownerId),
      }),
  });
};

export const useCancelReservation = (ownerId: string) => {
  const queryClient = useQueryClient();
  const { guestId } = useReserver();
  return useMutation({
    mutationFn: (id: string) => deleteReservation(id, guestId),
    onSuccess: () => toast("Бронь снята"),
    onError: () => toast("Не получилось снять бронь", { tone: "error" }),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: reservationKeys.forOwner(ownerId),
      }),
  });
};
