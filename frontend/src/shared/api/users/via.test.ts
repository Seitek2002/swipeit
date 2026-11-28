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
    // M02: приглашение в игру или план — не «по ссылке на вишлист».
    expect(viaForNewUser("remote", "santa_invite", "wishlist_link")).toBe(
      "santa_invite",
    );
    expect(viaForNewUser("remote", "plan_invite", "pick_link")).toBe(
      "plan_invite",
    );
  });

  it("remote: пришёл по ссылке — wishlist_link, иначе feed", () => {
    expect(viaForNewUser("remote", undefined, "wishlist_link")).toBe(
      "wishlist_link",
    );
    expect(viaForNewUser("remote", undefined, null)).toBe("feed");
  });
});
