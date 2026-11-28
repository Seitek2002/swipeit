import type { MyReservation } from "@/shared/api";
import { ROUTES } from "@/shared/config";

// Куда ведут фото и название строки «Я дарю» (UX-аудит X03): бронь по
// ссылке — обратно на эту ссылку (путь даёт сервер: «/w/?d=…» в демо,
// короткая ссылка потом), у друга из списка — его профиль. У старой ссылки
// без пути вести некуда — строка без ссылки, как раньше.
export const reservationWishlistHref = ({
  byLink,
  owner,
  wishlistUrl,
}: Pick<MyReservation, "byLink" | "owner" | "wishlistUrl">): null | string =>
  wishlistUrl ?? (byLink ? null : ROUTES.FRIEND_PROFILE(owner.id));

// Подпись под названием подарка: «Тимур · по ссылке · на Новый год». «По
// ссылке» — чтобы человек по ссылке не сливался с демо-другом того же имени.
export const reservationCaption = ({
  byLink,
  closed,
  occasion,
  ownerName,
}: {
  byLink?: boolean;
  closed: boolean;
  // Готовая строка повода (occasionLabel); пустая — повода нет.
  occasion: string;
  ownerName: string;
}): string =>
  [ownerName, byLink && "по ссылке", occasion, closed && "уже подарено"]
    .filter(Boolean)
    .join(" · ");

// Подпись строки «Открывал по ссылке»: повод, если он есть, и «по ссылке».
export const openedCaption = (occasion: string): string =>
  [occasion, "по ссылке"].filter(Boolean).join(" · ");
