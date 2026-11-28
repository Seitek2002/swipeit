import { describe, expect, it } from "vitest";

import { memberStatus } from "./member-status";

const joined = { joined: true, hasWishlist: true, opened: false };
const other = { drawn: false, isMe: false, needWishes: false };

describe("статус участника Санты (X08)", () => {
  it("до жеребьёвки — вишлист, у себя — «Собрать вишлист»", () => {
    expect(memberStatus(joined, other)).toBe("wishlist-ready");
    expect(memberStatus({ ...joined, hasWishlist: false }, other)).toBe(
      "no-wishlist",
    );
    expect(
      memberStatus({ ...joined, hasWishlist: false }, { ...other, isMe: true }),
    ).toBe("collect");
    // Вишлист есть, но в бюджет мало желаний (R06).
    expect(
      memberStatus(joined, { ...other, isMe: true, needWishes: true }),
    ).toBe("collect");
  });

  it("после жеребьёвки — только письмо, вишлист не показываем", () => {
    const drawn = { ...other, drawn: true };
    expect(memberStatus({ ...joined, opened: true }, drawn)).toBe(
      "letter-opened",
    );
    expect(memberStatus(joined, drawn)).toBe("letter-sealed");
    expect(
      memberStatus(
        { ...joined, hasWishlist: false, opened: true },
        { ...drawn, isMe: true, needWishes: true },
      ),
    ).toBe("letter-opened");
  });

  it("позванный, но не вступивший — «ещё не в игре»", () => {
    const invited = { ...joined, joined: false };
    expect(memberStatus(invited, other)).toBe("invited");
    expect(memberStatus(invited, { ...other, drawn: true })).toBe("invited");
  });
});
