import { describe, expect, it } from "vitest";

import { type Offer, type Product, cheapestOffer, storeOffers } from "./model";

const offer = (overrides: Partial<Offer>): Offer => ({
  marketplace: "aliexpress",
  url: "https://aliexpress.com/item/1",
  price: 1000,
  checkedAt: "2026-11-01",
  ...overrides,
});

const product = (offers: Offer[]): Product => ({
  id: "p",
  title: "Товар",
  description: "",
  category: "tech",
  interests: [],
  audience: "all",
  priceMin: 1000,
  priceMax: 1000,
  images: [{ src: "/x.svg", alt: "" }],
  popularity: 0,
  offers,
});

describe("cheapestOffer", () => {
  it("ведёт в самый дешёвый магазин, при равной цене — в первый", () => {
    const wb = offer({ marketplace: "wildberries", url: "wb", price: 900 });
    const ali = offer({ url: "ali", price: 1200 });
    const ozon = offer({ marketplace: "ozon", url: "ozon", price: 900 });
    expect(cheapestOffer(product([ali, wb, ozon]))).toBe(wb);
  });
});

describe("storeOffers", () => {
  it("один магазин — одна плашка с его самым дешёвым оффером", () => {
    const ali1 = offer({ url: "ali-1", price: 1500 });
    const wb = offer({ marketplace: "wildberries", url: "wb", price: 900 });
    const ali2 = offer({ url: "ali-2", price: 1100 });
    expect(storeOffers(product([ali1, wb, ali2]))).toEqual([
      { label: "AliExpress", offer: ali2 },
      { label: "Wildberries", offer: wb },
    ]);
  });

  it("«другие» магазины с разными доменами — разные плашки", () => {
    const kivano = offer({
      marketplace: "other",
      url: "https://www.kivano.kg/product/1",
    });
    const sulpak = offer({
      marketplace: "other",
      url: "https://sulpak.kg/g/1",
    });
    expect(storeOffers(product([kivano, sulpak])).map((s) => s.offer)).toEqual([
      kivano,
      sulpak,
    ]);
  });
});
