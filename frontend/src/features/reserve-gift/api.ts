"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { useMe } from "@/entities/user";

import {
  type ReservationsView,
  createReservation,
  createUser,
  deleteReservation,
  getMode,
  getReservations,
  isApiError,
  isNameRequired,
  reservationKeys,
} from "@/shared/api";
import { GUEST_REFETCH_MS } from "@/shared/config";
import { useAppMode } from "@/shared/lib/app-status";
import { useMounted } from "@/shared/lib/dom";
import { useGuestStore, useSessionStore } from "@/shared/store";
import { toast } from "@/shared/ui";

// Как гость открыл вишлист: share — код короткой ссылки (remote, доступ к
// броням без дружбы), live — перечитывать брони раз в GUEST_REFETCH_MS.
export type ReserveAccess = { live?: boolean; share?: string };

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

export const useReservations = (
  ownerId: string,
  { live = false, share }: ReserveAccess = {},
) => {
  const mounted = useMounted();
  const { guestId } = useReserver();
  // В remote брони читает только профиль (GET /reservations — с токеном).
  // Гость без профиля видит все желания свободными; занятое скажет CONFLICT,
  // а после первой брони профиль уже есть.
  const remote = useAppMode() === "remote";
  const hasProfile = useSessionStore((state) => Boolean(state.activeUserId));
  const query = useQuery({
    queryKey: reservationKeys.forOwner(ownerId),
    queryFn: () =>
      getReservations(ownerId, remote ? undefined : guestId, share),
    enabled: mounted && Boolean(ownerId) && (!remote || hasProfile),
    refetchInterval: live ? GUEST_REFETCH_MS : false,
    refetchIntervalInBackground: false,
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

// Бронь гостя без профиля в remote (BACKEND.md §3.1, §14.8): сначала тихий
// профиль (POST /users, via «reservation» для воронки Q01), потом бронь с
// именем из формы — сервер сохранит его и в профиль. Профиль становится
// профилем вкладки в любом случае, даже если бронь не прошла (CONFLICT):
// он уже создан, и токен лежит в хранилище.
const reserveAsNewProfile = async (input: {
  itemKey: string;
  name?: string;
  ownerId: string;
  share?: string;
}) => {
  const me = await createUser({ via: "reservation" });
  try {
    return await createReservation(input);
  } finally {
    useSessionStore.getState().setActiveUser(me.id);
  }
};

export const useReserve = (ownerId: string, { share }: ReserveAccess = {}) => {
  const queryClient = useQueryClient();
  const { guestId } = useReserver();
  return useMutation({
    mutationFn: ({ itemKey, name }: { itemKey: string; name?: string }) => {
      if (getMode() !== "remote") {
        return createReservation({ ownerId, itemKey, name, guestId, share });
      }
      if (!useSessionStore.getState().activeUserId) {
        return reserveAsNewProfile({ ownerId, itemKey, name, share });
      }
      return createReservation({ ownerId, itemKey, name, share });
    },
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
    mutationFn: (id: string) =>
      deleteReservation(id, getMode() === "remote" ? undefined : guestId),
    onSuccess: () => toast("Бронь снята"),
    onError: () => toast("Не получилось снять бронь", { tone: "error" }),
    onSettled: () =>
      queryClient.invalidateQueries({
        queryKey: reservationKeys.forOwner(ownerId),
      }),
  });
};
