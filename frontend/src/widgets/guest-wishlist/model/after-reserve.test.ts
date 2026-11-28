import { describe, expect, it } from "vitest";

import { addReservedKey, afterReserveKey } from "./after-reserve";

const minesOf =
  (...keys: string[]) =>
  (itemKey: string) =>
    keys.includes(itemKey);

describe("плашка после брони гостя wishlist-guest (G03)", () => {
  it("бронь → плашка под этой карточкой", () => {
    const reserved = addReservedKey([], "p_1");
    expect(afterReserveKey(reserved, minesOf("p_1"))).toBe("p_1");
  });

  it("бронь → отмена → плашки нет", () => {
    const reserved = addReservedKey([], "p_1");
    expect(afterReserveKey(reserved, minesOf())).toBeNull();
  });

  it("отменили одну из двух — плашка под оставшейся", () => {
    const reserved = addReservedKey(addReservedKey([], "p_1"), "p_2");
    expect(afterReserveKey(reserved, minesOf("p_1", "p_2"))).toBe("p_1");
    expect(afterReserveKey(reserved, minesOf("p_2"))).toBe("p_2");
  });

  it("сняли и забронировали снова — плашка снова под ней", () => {
    let reserved = addReservedKey([], "p_1");
    expect(afterReserveKey(reserved, minesOf())).toBeNull();
    reserved = addReservedKey(reserved, "p_1");
    expect(reserved).toEqual(["p_1"]);
    expect(afterReserveKey(reserved, minesOf("p_1"))).toBe("p_1");
  });

  it("брони не с этой страницы плашку не зовут", () => {
    expect(afterReserveKey([], minesOf("p_9"))).toBeNull();
  });
});
