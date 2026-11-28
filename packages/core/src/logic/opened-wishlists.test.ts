import { describe, expect, it } from "vitest";

import type { ExternalWishlist } from "../api/wishlist/types";
import { openedWishlists, snapshotForReservation } from "./opened-wishlists";

const snapshot = (
  id: string,
  patch: Partial<ExternalWishlist> & { userId?: string } = {},
): ExternalWishlist => {
  const { userId, ...rest } = patch;
  return {
    id,
    owner: {
      name: "Тимур",
      avatarColor: "mint",
      ...(userId ? { userId } : {}),
    },
    meta: { occasion: { kind: "new_year", date: "2026-12-31" } },
    items: [{ key: "p_1", productId: "p_1", priority: "normal" }],
    openedAt: "2026-11-01T10:00:00.000Z",
    link: `/w/?d=${id}`,
    ...rest,
  };
};

const NO_FRIENDS = new Set<string>();

describe("«Открывал по ссылке» (X03)", () => {
  it("имя, повод и путь снимка", () => {
    expect(
      openedWishlists(
        [
          {
            snapshot: snapshot("ew_a", { userId: "u_timur" }),
            openedAt: "2026-11-28T10:00:00.000Z",
          },
        ],
        { friendIds: NO_FRIENDS, meId: "u_me" },
      ),
    ).toEqual([
      {
        id: "ew_a",
        owner: { name: "Тимур", avatarColor: "mint", userId: "u_timur" },
        occasion: { kind: "new_year", date: "2026-12-31" },
        openedAt: "2026-11-28T10:00:00.000Z",
        url: "/w/?d=ew_a",
      },
    ]);
  });

  it("две ссылки одного человека — одна строка, последняя открытая", () => {
    const list = openedWishlists(
      [
        {
          snapshot: snapshot("ew_new_year", { userId: "u_timur" }),
          openedAt: "2026-11-28T10:00:00.000Z",
        },
        {
          snapshot: snapshot("ew_birthday", { userId: "u_timur" }),
          openedAt: "2026-11-28T11:00:00.000Z",
        },
      ],
      { friendIds: NO_FRIENDS, meId: "u_me" },
    );
    expect(list.map((item) => item.id)).toEqual(["ew_birthday"]);
  });

  it("свежие сверху; свой вишлист, друзья и снимки без пути — мимо", () => {
    const list = openedWishlists(
      [
        {
          snapshot: snapshot("ew_old", { userId: "u_old" }),
          openedAt: "2026-11-20T10:00:00.000Z",
        },
        {
          snapshot: snapshot("ew_fresh", { userId: "u_fresh" }),
          openedAt: "2026-11-27T10:00:00.000Z",
        },
        {
          snapshot: snapshot("ew_mine", { userId: "u_me" }),
          openedAt: "2026-11-28T10:00:00.000Z",
        },
        {
          snapshot: snapshot("ew_friend", { userId: "u_azamat" }),
          openedAt: "2026-11-28T10:00:00.000Z",
        },
        {
          snapshot: snapshot("ew_nolink", { userId: "u_x", link: undefined }),
          openedAt: "2026-11-28T10:00:00.000Z",
        },
      ],
      { friendIds: new Set(["u_azamat"]), meId: "u_me" },
    );
    expect(list.map((item) => item.id)).toEqual(["ew_fresh", "ew_old"]);
  });

  it("старая ссылка без id владельца — своя строка по id снимка", () => {
    const list = openedWishlists(
      [
        { snapshot: snapshot("ew_a"), openedAt: "2026-11-28T10:00:00.000Z" },
        { snapshot: snapshot("ew_b"), openedAt: "2026-11-28T09:00:00.000Z" },
      ],
      { friendIds: NO_FRIENDS },
    );
    expect(list.map((item) => item.id)).toEqual(["ew_a", "ew_b"]);
    expect(list[0]?.owner).not.toHaveProperty("userId");
  });
});

describe("снимок для строки «Я дарю» (X03)", () => {
  const newYear = snapshot("ew_ny", { userId: "u_timur" });
  const birthday = snapshot("ew_bd", {
    userId: "u_timur",
    items: [{ key: "p_2", productId: "p_2", priority: "normal" }],
    openedAt: "2026-11-27T10:00:00.000Z",
  });
  const other = snapshot("ew_other", { userId: "u_other" });

  it("снимок этого владельца, где есть желание", () => {
    expect(
      snapshotForReservation([birthday, other, newYear], {
        ownerId: "u_timur",
        itemKey: "p_1",
        openedAt: {},
      })?.id,
    ).toBe("ew_ny");
  });

  it("из открытых этим человеком — последний", () => {
    const again = snapshot("ew_ny2", { userId: "u_timur" });
    expect(
      snapshotForReservation([newYear, again], {
        ownerId: "u_timur",
        itemKey: "p_1",
        openedAt: {
          ew_ny: "2026-11-28T12:00:00.000Z",
          ew_ny2: "2026-11-28T09:00:00.000Z",
        },
      })?.id,
    ).toBe("ew_ny");
  });

  it("открытые им важнее чужих в той же базе", () => {
    const fresher = snapshot("ew_lan", {
      userId: "u_timur",
      openedAt: "2026-11-30T10:00:00.000Z",
    });
    expect(
      snapshotForReservation([fresher, newYear], {
        ownerId: "u_timur",
        itemKey: "p_1",
        openedAt: { ew_ny: "2026-11-28T10:00:00.000Z" },
      })?.id,
    ).toBe("ew_ny");
  });

  it("старая ссылка без userId — по id снимка", () => {
    const legacy = snapshot("ew_legacy");
    expect(
      snapshotForReservation([legacy], {
        ownerId: "ew_legacy",
        itemKey: "p_1",
        openedAt: {},
      })?.id,
    ).toBe("ew_legacy");
  });

  it("желания нет ни в одном снимке — ничего", () => {
    expect(
      snapshotForReservation([newYear], {
        ownerId: "u_timur",
        itemKey: "p_9",
        openedAt: {},
      }),
    ).toBeUndefined();
  });
});
