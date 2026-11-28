import { describe, expect, it } from "vitest";

import { ROUTES } from "@/shared/config";

import {
  openedCaption,
  reservationCaption,
  reservationWishlistHref,
} from "./model";

const owner = { id: "u_timur", name: "Тимур", avatarColor: "mint" as const };

describe("строка «Я дарю» ведёт к вишлисту (X03)", () => {
  it("бронь по ссылке — на сохранённую ссылку", () => {
    expect(
      reservationWishlistHref({
        owner,
        byLink: true,
        wishlistUrl: "/w/?d=abc",
      }),
    ).toBe("/w/?d=abc");
  });

  it("друг из списка — его профиль", () => {
    expect(reservationWishlistHref({ owner })).toBe(
      ROUTES.FRIEND_PROFILE("u_timur"),
    );
  });

  it("старая ссылка без пути — никуда", () => {
    expect(reservationWishlistHref({ owner, byLink: true })).toBeNull();
  });
});

describe("подписи (X03)", () => {
  it("человек по ссылке подписан «по ссылке»", () => {
    expect(
      reservationCaption({
        ownerName: "Тимур",
        byLink: true,
        occasion: "на Новый год, 31 декабря",
        closed: false,
      }),
    ).toBe("Тимур · по ссылке · на Новый год, 31 декабря");
  });

  it("друг без повода, уже подарено", () => {
    expect(
      reservationCaption({
        ownerName: "Азамат",
        occasion: "",
        closed: true,
      }),
    ).toBe("Азамат · уже подарено");
  });

  it("«Открывал по ссылке»: повод и «по ссылке»", () => {
    expect(openedCaption("на Новый год, 31 декабря")).toBe(
      "на Новый год, 31 декабря · по ссылке",
    );
    expect(openedCaption("")).toBe("по ссылке");
  });
});
