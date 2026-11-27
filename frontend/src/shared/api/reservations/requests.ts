import { getTransport } from "../transport";
import type { Reservation, ReservationsView } from "../wishlist/types";

export const getReservations = (
  ownerId: string,
  guestId?: string,
): Promise<ReservationsView> =>
  getTransport().request<ReservationsView>("GET", "/reservations", undefined, {
    ownerId,
    guestId,
  });

// name нужен только гостю без профиля. От профиля сервер берёт его имя, а
// профиль без имени получает NAME_REQUIRED (TECH_SPEC §6).
export const createReservation = (input: {
  guestId?: string;
  itemKey: string;
  name?: string;
  ownerId: string;
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
