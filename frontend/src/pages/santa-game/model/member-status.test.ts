import { describe, expect, it } from "vitest";

import { memberStatus, needsWishes, ownWishesHint } from "./member-status";

const joined = (wishesInBudget: number) => ({
  joined: true,
  hasWishlist: wishesInBudget > 0,
  wishesInBudget,
  opened: false,
});
const other = { drawn: false, isMe: false };
const me = { drawn: false, isMe: true };

describe("статус участника Санты (X08, Z03)", () => {
  it("до жеребьёвки — по желаниям в бюджете: 0, 2 и 3", () => {
    expect(memberStatus(joined(0), other)).toBe("no-wishlist");
    expect(memberStatus(joined(2), other)).toBe("wishlist-few");
    expect(memberStatus(joined(3), other)).toBe("wishlist-ready");
    // Желания есть, но все дороже бюджета, — мало в бюджете (T28).
    expect(memberStatus({ ...joined(0), hasWishlist: true }, other)).toBe(
      "wishlist-few",
    );
  });

  it("у себя не готово — «Собрать вишлист» и подсказка, готово — галочка", () => {
    expect(memberStatus(joined(0), me)).toBe("collect");
    expect(memberStatus(joined(2), me)).toBe("collect");
    expect(memberStatus(joined(3), me)).toBe("wishlist-ready");
    expect(needsWishes(joined(0))).toBe(true);
    expect(needsWishes(joined(2))).toBe(true);
    expect(needsWishes(joined(3))).toBe(false);
  });

  it("у себя вишлист есть, но всё дороже бюджета, — «Добавить желание» (T28)", () => {
    const overBudget = { ...joined(0), hasWishlist: true };
    expect(memberStatus(overBudget, me)).toBe("add-cheaper");
    expect(needsWishes(overBudget)).toBe(true);
    expect(ownWishesHint(overBudget, 2000)).toBe(
      "Ничего в бюджете 2 000 сом — добавь пару желаний подешевле",
    );
    expect(ownWishesHint(joined(0), 2000)).toBe(
      "Собери вишлист, чтобы твоему Санте было проще",
    );
    expect(ownWishesHint(joined(2), 2000)).toBe(
      "Собери вишлист, чтобы твоему Санте было проще",
    );
    expect(ownWishesHint(joined(3), 2000)).toBeNull();
  });

  it("ответ без wishesInBudget — по hasWishlist", () => {
    const old = { joined: true, hasWishlist: true, opened: false };
    expect(memberStatus(old, other)).toBe("wishlist-ready");
    expect(memberStatus({ ...old, hasWishlist: false }, other)).toBe(
      "no-wishlist",
    );
  });

  it("после жеребьёвки — только письмо, вишлист не показываем", () => {
    const drawn = { ...other, drawn: true };
    expect(memberStatus({ ...joined(3), opened: true }, drawn)).toBe(
      "letter-opened",
    );
    expect(memberStatus(joined(3), drawn)).toBe("letter-sealed");
    expect(
      memberStatus({ ...joined(0), opened: true }, { ...drawn, isMe: true }),
    ).toBe("letter-opened");
  });

  it("позванный, но не вступивший — «ещё не в игре»", () => {
    const invited = { ...joined(3), joined: false };
    expect(memberStatus(invited, other)).toBe("invited");
    expect(memberStatus(invited, { ...other, drawn: true })).toBe("invited");
    expect(needsWishes(invited)).toBe(false);
  });
});
