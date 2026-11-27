import type { MyReservation } from "../api/wishlist/types";
import { toDateKey } from "../format/index";

// «Я дарю» (auto-tasks P02): какие свои брони показывать и в каком порядке.
// Общая для мока и сервера.

// Закрытая бронь («Уже подарено») уходит через 30 дней после даты повода, а
// без даты — после закрытия.
export const MY_RESERVATION_CLOSED_KEEP_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

const dateKeyPlusDays = (dateKey: string, days: number) => {
  const [year = 1970, month = 1, day = 1] = dateKey.split("-").map(Number);
  return toDateKey(new Date(year, month - 1, day + days, 12).getTime());
};

const isExpired = (reservation: MyReservation, now: number) => {
  if (!reservation.closed) return false;
  const today = toDateKey(now);
  const date = reservation.occasion?.date;
  if (date) {
    return dateKeyPlusDays(date, MY_RESERVATION_CLOSED_KEEP_DAYS) < today;
  }
  const closedAt = reservation.closedAt
    ? Date.parse(reservation.closedAt)
    : Number.NaN;
  return (
    Number.isFinite(closedAt) &&
    now - closedAt > MY_RESERVATION_CLOSED_KEEP_DAYS * DAY_MS
  );
};

// Открытые — ближайшая дата повода первой, без даты — после датированных (по
// времени брони); закрытые — внизу.
export const visibleMyReservations = (
  list: readonly MyReservation[],
  now: number,
): MyReservation[] =>
  list
    .filter((reservation) => !isExpired(reservation, now))
    .sort((a, b) => {
      if (a.closed !== b.closed) return a.closed ? 1 : -1;
      const da = a.occasion?.date;
      const db = b.occasion?.date;
      if (da && db && da !== db) return da.localeCompare(db);
      if (da && !db) return -1;
      if (!da && db) return 1;
      return a.at.localeCompare(b.at);
    });
