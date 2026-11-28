import { describe, expect, it } from "vitest";

import { PICK_LIMIT_MAX, fitsPickLimit, minPicksFor, upToGifts } from "./limit";

describe("«Сколько можно выбрать»", () => {
  it("без лимита — отправить после 3, выбирать сколько угодно", () => {
    expect(minPicksFor()).toBe(3);
    expect(fitsPickLimit(PICK_LIMIT_MAX + 5)).toBe(true);
  });

  it("лимит 3: 3 помещаются, 4 — нет; лимит 1 — отправить можно с одним", () => {
    expect(fitsPickLimit(3, 3)).toBe(true);
    expect(fitsPickLimit(4, 3)).toBe(false);
    expect(minPicksFor(3)).toBe(3);
    expect(minPicksFor(5)).toBe(3);
    expect(minPicksFor(1)).toBe(1);
  });

  it("«до N подарков» — в родительном", () => {
    expect(upToGifts(1)).toBe("до 1 подарка");
    expect(upToGifts(3)).toBe("до 3 подарков");
    expect(upToGifts(11)).toBe("до 11 подарков");
    expect(upToGifts(21)).toBe("до 21 подарка");
  });
});
