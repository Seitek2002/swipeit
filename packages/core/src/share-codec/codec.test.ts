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

describe("кодек ссылки-фильтра и ответа", () => {
  it("ссылка-фильтр: туда и обратно, скрытые цены", async () => {
    const { decodePickRequest, encodePickRequest } = await import("./codec");
    const request = {
      id: "pk_1",
      from: {
        name: "Азамат",
        avatarColor: "mint" as const,
        userId: "u_azamat",
      },
      toName: "Айгерим",
      filters: {
        budget: { min: 0, max: 5000 },
        categories: ["tech" as const, "sport" as const],
        marketplaces: [],
      },
      hidePrices: true,
      occasion: { kind: "birthday" as const, date: "2027-03-14" },
      message: "Выбери что-нибудь",
    };
    expect(decodePickRequest(encodePickRequest(request))).toEqual(request);
    expect(decodePickRequest("битая")).toBeNull();
  });

  it("ссылка-фильтр: «другие» магазины по домену едут в ссылке (UX-аудит M1)", async () => {
    const { decodePickRequest, encodePickRequest } = await import("./codec");
    const request = {
      id: "pk_2",
      from: { name: "Азамат", avatarColor: "mint" as const },
      filters: {
        budget: { min: 0, max: null },
        categories: [],
        marketplaces: ["aliexpress" as const],
        shops: ["kivano.kg", "labirint.ru"],
      },
      hidePrices: false,
    };
    expect(decodePickRequest(encodePickRequest(request))?.filters).toEqual(
      request.filters,
    );
  });

  it("аудитория «для неё» едет в ссылке; «всем» и старые ссылки без неё — «всем»", async () => {
    const { decodePickRequest, encodePickRequest } = await import("./codec");
    const request = {
      id: "pk_2",
      from: { name: "Азамат", avatarColor: "mint" as const },
      filters: {
        budget: { min: 0, max: 3000 },
        categories: [],
        marketplaces: [],
        audience: "female" as const,
      },
      hidePrices: false,
    };
    expect(decodePickRequest(encodePickRequest(request))).toEqual(request);
    const forAll = encodePickRequest({
      ...request,
      filters: { ...request.filters, audience: "all" },
    });
    expect(decodePickRequest(forAll)?.filters.audience).toBeUndefined();
    // Ссылка, отправленная до этапа 7: в fl нет поля a.
    const old = encodeEnvelope("pk", {
      i: "pk_old",
      f: { n: "Азамат", c: "mint" },
      fl: { b: [0, null], c: ["tech"], m: [] },
    });
    expect(decodePickRequest(old)).toMatchObject({
      id: "pk_old",
      filters: { categories: ["tech"], audience: undefined },
    });
  });

  it("«Сколько можно выбрать» едет в ссылке; без него — сколько угодно", async () => {
    const { decodePickRequest, encodePickRequest } = await import("./codec");
    const request = {
      id: "pk_3",
      from: { name: "Азамат", avatarColor: "mint" as const },
      filters: {
        budget: { min: 0, max: null },
        categories: [],
        marketplaces: [],
      },
      hidePrices: false,
      maxPicks: 3,
    };
    expect(decodePickRequest(encodePickRequest(request))?.maxPicks).toBe(3);
    const unlimited = encodePickRequest({ ...request, maxPicks: undefined });
    expect(decodePickRequest(unlimited)?.maxPicks).toBeUndefined();
    // Лимит вне 1…20 — ссылка битая, а не «без лимита».
    const broken = encodeEnvelope("pk", {
      i: "pk_x",
      f: { n: "Азамат", c: "mint" },
      fl: { b: [0, null], c: [], m: [] },
      x: 0,
    });
    expect(decodePickRequest(broken)).toBeNull();
  });

  it("ответ: туда и обратно, чужой тип — null", async () => {
    const { decodePickAnswer, encodePickAnswer, encodePickRequest } =
      await import("./codec");
    const answer = {
      requestId: "pk_1",
      by: {
        name: "Айгерим",
        avatarColor: "mandarin" as const,
        gender: "female" as const,
      },
      picks: [
        {
          productId: "p_0001",
          priority: "top" as const,
          variantChoice: { color: "black" },
        },
        { productId: "p_0002", priority: "normal" as const },
      ],
    };
    expect(decodePickAnswer(encodePickAnswer(answer))).toEqual(answer);
    const request = encodePickRequest({
      id: "x",
      from: { name: "А", avatarColor: "mint" },
      filters: {
        budget: { min: 0, max: null },
        categories: [],
        marketplaces: [],
      },
      hidePrices: false,
    });
    expect(decodePickAnswer(request)).toBeNull();
  });
});
