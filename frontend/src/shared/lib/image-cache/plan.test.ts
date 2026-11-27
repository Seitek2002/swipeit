import { describe, expect, it } from "vitest";

import { preloadPlan } from "./plan";

const card = (id: string, count: number) => ({
  images: Array.from({ length: count }, (_, index) => ({
    src: `/${id}/${index + 1}.webp`,
  })),
});

describe("окно предзагрузки фото колоды", () => {
  it("порядок: обложка, 2-е верхней, обложка следующей, остальные, …", () => {
    expect(
      preloadPlan(
        [card("a", 4), card("b", 3), card("c", 2), card("d", 2)],
        0,
        false,
      ),
    ).toEqual([
      "/a/1.webp",
      "/a/2.webp",
      "/b/1.webp",
      "/a/3.webp",
      "/a/4.webp",
      "/b/2.webp",
      "/c/1.webp",
      "/c/2.webp",
    ]);
  });

  it("четвёртая карточка в окно не попадает, у одиночного фото нет второго", () => {
    const plan = preloadPlan([card("a", 1), card("b", 1)], 0, false);
    expect(plan).toEqual(["/a/1.webp", "/b/1.webp"]);
  });

  it("saveData: у верхней следующее после текущего, у следующей — обложка", () => {
    expect(
      preloadPlan([card("a", 5), card("b", 3), card("c", 2)], 2, true),
    ).toEqual(["/a/3.webp", "/a/4.webp", "/b/1.webp"]);
  });

  it("один URL — одна загрузка", () => {
    const same = { images: [{ src: "/x.webp" }, { src: "/x.webp" }] };
    expect(preloadPlan([same], 0, false)).toEqual(["/x.webp"]);
  });

  it("пустая колода — грузить нечего", () => {
    expect(preloadPlan([], 0, false)).toEqual([]);
  });
});
