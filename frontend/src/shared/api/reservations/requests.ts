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

export const createReservation = (input: {
  guestId?: string;
  itemKey: string;
  name: string;
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
