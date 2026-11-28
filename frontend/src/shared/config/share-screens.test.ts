import { describe, expect, it } from "vitest";

import { shareScreenPath } from "./share-screens";

describe("shareScreenPath", () => {
  it("вишлист и «Выбери подарок сам» — свой экран с тем же кодом", () => {
    expect(shareScreenPath({ kind: "wishlist" }, "Ab3")).toBe("/w/?s=Ab3");
    expect(shareScreenPath({ kind: "pick_request" }, "Ab3")).toBe(
      "/pick/?s=Ab3",
    );
    expect(shareScreenPath({ kind: "pick_answer" }, "Ab3")).toBe(
      "/pick/answer/?s=Ab3",
    );
  });

  it("план и игра — экран приглашения по id", () => {
    expect(shareScreenPath({ kind: "plan", planId: "pl_1" }, "x")).toBe(
      "/plans/join/?id=pl_1",
    );
    expect(shareScreenPath({ kind: "santa", gameId: "sg_1" }, "x")).toBe(
      "/santa/join/?id=sg_1",
    );
  });
});
