import { describe, expect, it } from "vitest";

import { viaForNewUser } from "./via";

describe("viaForNewUser (Q01)", () => {
  it("в local и lan поле не шлём", () => {
    expect(viaForNewUser("local", "reservation", "wishlist_link")).toBe(
      undefined,
    );
    expect(viaForNewUser("lan", undefined, null)).toBe(undefined);
  });

  it("remote: явное значение важнее запомненной ссылки", () => {
    expect(viaForNewUser("remote", "reservation", "wishlist_link")).toBe(
      "reservation",
    );
  });

  it("remote: пришёл по ссылке — wishlist_link, иначе feed", () => {
    expect(viaForNewUser("remote", undefined, "wishlist_link")).toBe(
      "wishlist_link",
    );
    expect(viaForNewUser("remote", undefined, null)).toBe("feed");
  });
});
