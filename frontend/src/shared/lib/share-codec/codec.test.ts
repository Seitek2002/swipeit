import { compressToEncodedURIComponent } from "lz-string";
import { describe, expect, it } from "vitest";

import {
  type SharedWishlist,
  decodeWishlist,
  encodeEnvelope,
  encodeWishlist,
} from "./codec";

const sample: SharedWishlist = {
  owner: {
    name: "Айгерим",
    avatarColor: "mandarin",
    userId: "u_aigerim",
    birthday: "03-14",
  },
  occasion: { kind: "birthday", date: "2027-03-14" },
  message: "Буду рада любому подарку из списка",
  items: [
    {
      productId: "p_0001",
      priority: "top",
      variantChoice: { color: "black" },
      note: "Лучше чёрный",
    },
    { productId: "p_0002", priority: "normal" },
    {
      custom: {
        title: "Абонемент в бассейн",
        priceMin: 2500,
        priceMax: 4000,
        url: "https://example.kg/pool",
      },
      priority: "normal",
    },
  ],
};

describe("кодек вишлиста", () => {
  it("круговое кодирование без потерь", () => {
    expect(decodeWishlist(encodeWishlist(sample))).toEqual(sample);
  });

  it("закодированная строка безопасна для URL", () => {
    expect(encodeWishlist(sample)).toMatch(/^[A-Za-z0-9+\-$]+$/);
  });

  it("вишлист на 30 желаний укладывается в 2 000 символов URL", () => {
    const big: SharedWishlist = {
      ...sample,
      items: Array.from({ length: 30 }, (_, index) => ({
        productId: `p_${String(index + 1).padStart(4, "0")}`,
        priority: index < 3 ? ("top" as const) : ("normal" as const),
        variantChoice:
          index % 4 === 0 ? { color: "black", size: "m" } : undefined,
        note: index % 5 === 0 ? "Можно любой цвет" : undefined,
      })),
    };
    const url = `https://seitek2002.github.io/swipeit/w/?d=${encodeWishlist(big)}`;
    expect(url.length).toBeLessThanOrEqual(2000);
    expect(decodeWishlist(encodeWishlist(big))).toEqual(big);
  });

  it("битая ссылка — null, а не исключение", () => {
    expect(decodeWishlist("")).toBeNull();
    expect(decodeWishlist(null)).toBeNull();
    expect(decodeWishlist("совсем-не-то")).toBeNull();
    expect(decodeWishlist(encodeWishlist(sample).slice(0, 40))).toBeNull();
    expect(
      decodeWishlist(compressToEncodedURIComponent("{не json")),
    ).toBeNull();
  });

  it("чужой тип конверта или неверная схема — null", () => {
    expect(decodeWishlist(encodeEnvelope("pk", { o: {} }))).toBeNull();
    expect(
      decodeWishlist(
        encodeEnvelope("wl", { o: { n: "А", c: "чёрный" }, i: [] }),
      ),
    ).toBeNull();
    expect(
      decodeWishlist(
        encodeEnvelope("wl", { o: { n: "А", c: "mint" }, i: [{ t: 1 }] }),
      ),
    ).toBeNull();
  });
});
