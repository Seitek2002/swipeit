import { describe, expect, it } from "vitest";

import { createEmptyDb, parseDb } from "./db";
import { defaultWishlistIdOf } from "./wishlists";

describe("чтение базы", () => {
  it("нет данных — null (база создаётся из сида)", () => {
    expect(parseDb(null)).toBeNull();
    expect(parseDb("")).toBeNull();
  });

  it("битый JSON — broken (база пересоздаётся, тост)", () => {
    expect(parseDb("{сломано")).toBe("broken");
  });

  it("JSON не по схеме — broken", () => {
    expect(parseDb(JSON.stringify({ version: 1, users: "не объект" }))).toBe(
      "broken",
    );
    expect(parseDb(JSON.stringify({ ...createEmptyDb(), version: 2 }))).toBe(
      "broken",
    );
  });

  it("правильная база читается как есть", () => {
    const db = createEmptyDb();
    expect(parseDb(JSON.stringify(db))).toEqual(db);
  });

  it("база до нескольких вишлистов читается без сброса: «Общий» с поводом и сообщением из meta, желания — в нём", () => {
    const old = createEmptyDb() as Record<string, unknown>;
    delete old.wishlists;
    delete old.activeWishlist;
    const raw = {
      ...old,
      users: {
        u_dana: {
          id: "u_dana",
          name: "Дана",
          avatarColor: "rose",
          interests: [],
          audience: "all",
          isBot: false,
          createdAt: "2026-11-01T00:00:00.000Z",
        },
      },
      wishlistItems: {
        u_dana: [
          {
            id: "wi_1",
            ownerId: "u_dana",
            source: { kind: "product", productId: "p_0001" },
            priority: "normal",
            order: 0,
            status: "active",
            addedAt: "2026-11-02T00:00:00.000Z",
          },
        ],
      },
      wishlistMeta: {
        u_dana: {
          ownerId: "u_dana",
          hideReservationCount: false,
          occasion: { kind: "birthday", date: "2027-03-14" },
          message: "Буду рада",
          dismissedGivenHintFor: "2026-03-14",
        },
      },
    };
    const db = parseDb(JSON.stringify(raw));
    if (db === null || db === "broken") throw new Error("база сброшена");
    expect(db.version).toBe(1);
    const id = defaultWishlistIdOf("u_dana");
    expect(db.wishlists.u_dana).toEqual([
      {
        id,
        ownerId: "u_dana",
        name: "Общий",
        isDefault: true,
        occasion: { kind: "birthday", date: "2027-03-14" },
        message: "Буду рада",
        dismissedGivenHintFor: "2026-03-14",
        createdAt: "2026-11-01T00:00:00.000Z",
      },
    ]);
    expect(db.activeWishlist).toEqual({});
    expect(db.wishlistItems.u_dana?.map((item) => item.wishlistId)).toEqual([
      id,
    ]);
    // Повторное чтение ничего не меняет.
    expect(parseDb(JSON.stringify(db))).toEqual(db);
  });
});
