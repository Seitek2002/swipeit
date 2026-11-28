import { describe, expect, it } from "vitest";

import { CONTRACT, contractFor, featureRoutes, routeKey } from "./contract";

describe("контракт API", () => {
  it("без повторов", () => {
    const keys = CONTRACT.map((item) => routeKey(item.method, item.path));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("демо-маршрутов нет на сервере, входа через Telegram — в демо", () => {
    const remote = new Set(
      contractFor("remote").map((item) => routeKey(item.method, item.path)),
    );
    expect(remote.has("POST /auth/demo")).toBe(false);
    expect(remote.has("POST /plans/expire")).toBe(false);
    expect(remote.has("GET /demo/settings")).toBe(false);
    expect(
      contractFor("local").some((item) => item.path === "/auth/telegram"),
    ).toBe(false);
  });

  it("несколько вишлистов: маршруты spec §3.2 во всех режимах, нужен профиль", () => {
    const keys = featureRoutes("multiWishlists").map((item) =>
      routeKey(item.method, item.path),
    );
    expect(keys.sort()).toEqual(
      [
        "GET /wishlists",
        "POST /wishlists",
        "PATCH /wishlists/:id",
        "DELETE /wishlists/:id",
        "POST /wishlists/:id/activate",
        "POST /wishlist/items/:id/move",
        "POST /wishlist/items/:id/copy",
        "GET /users/:id/wishlists",
        "POST /santa/:id/wishlist",
      ].sort(),
    );
    for (const item of featureRoutes("multiWishlists")) {
      expect(item.access).toBe("user");
      expect([...item.modes].sort()).toEqual(["lan", "local", "remote"]);
    }
    // Прежние маршруты вишлиста остаются без пометки функции.
    expect(
      CONTRACT.find(
        (item) => item.path === "/wishlist" && item.method === "GET",
      )?.feature,
    ).toBeUndefined();
  });
});
