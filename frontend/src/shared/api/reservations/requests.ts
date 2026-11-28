import { getTransport } from "../transport";
import type {
  MyReservation,
  Reservation,
  ReservationsView,
} from "../wishlist/types";

// share — код короткой ссылки (remote): по нему гость видит брони без
// дружбы с владельцем (BACKEND.md §4.4).
export const getReservations = (
  ownerId: string,
  guestId?: string,
  share?: string,
): Promise<ReservationsView> =>
  getTransport().request<ReservationsView>("GET", "/reservations", undefined, {
    ownerId,
    guestId,
    share,
  });

// name нужен только гостю без профиля. От профиля сервер берёт его имя, а
// профиль без имени получает NAME_REQUIRED (TECH_SPEC §6).
export const createReservation = (input: {
  guestId?: string;
  itemKey: string;
  name?: string;
  ownerId: string;
  share?: string;
}): Promise<Reservation> =>
  getTransport().request<Reservation>("POST", "/reservations", input);

export const deleteReservation = (
  id: string,
  guestId?: string,
): Promise<{ ok: true }> =>
  getTransport().request(
    "DELETE",
    `/reservations/${encodeURIComponent(id)}`,
    undefined,
    {
      guestId,
    },
  );

// «Я дарю» — свои брони (auto-tasks P02).
export const getMyReservations = (guestId?: string): Promise<MyReservation[]> =>
  getTransport().request<MyReservation[]>(
    "GET",
    "/me/reservations",
    undefined,
    { guestId },
  );
